"""Evals admin: armado del request y verificacion de expectativas (sin red; testeable offline)."""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EVALS = ROOT / "evals"
HELP_POINTERS = ("/ayuda", "manual", "Ayuda")


def load(name: str) -> dict:
    return json.loads((EVALS / name).read_text(encoding="utf-8"))


def apply_overrides(catalog: dict, overrides: dict[str, dict[str, dict]]) -> dict:
    cat = copy.deepcopy(catalog)
    for group, by_handle in overrides.items():
        for item in cat[group]:
            if item["handle"] in by_handle:
                item.update(by_handle[item["handle"]])
    return cat


def build_request(suite: dict, case: dict) -> dict:
    req = case["request"]
    kind = suite["kind"]
    if kind == "admin_chat":
        catalog = apply_overrides(suite["catalog"], req.get("catalogOverrides", {}))
        return {
            "locale": "es",
            "today": req.get("today", suite["today"]),
            "message": req["message"],
            "history": req.get("history", []),
            "catalog": catalog,
            "catalogTruncated": False,
            "helpChunks": req.get("helpChunks", []),
            "repair": None,
        }
    if kind == "admin_digest":
        return {"locale": "es", "today": suite["today"], "facts": req["facts"]}
    return {
        "locale": "es",
        "audience": req.get("audience", "ADMIN"),
        "question": req["question"],
        "chunks": suite["chunks"],
    }


def build_chat_request_for_help_case(suite: dict, case: dict) -> dict:
    """Los casos de ayuda de /v1/admin/chat usan el catalogo vacio."""
    req = case["request"]
    return {
        "locale": "es",
        "today": "2026-10-18",
        "message": req["message"],
        "history": [],
        "catalog": {"users": [], "teams": [], "cycles": [], "objectives": [], "keyResults": []},
        "catalogTruncated": False,
        "helpChunks": req.get("helpChunks", suite["chunks"]),
        "repair": None,
    }


def dig(obj: Any, path: str) -> Any:
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _actions(body: dict) -> list[dict]:
    return (body.get("plan") or {}).get("actions", [])


def _find(actions: list[dict], selector: Any) -> dict | None:
    if isinstance(selector, int):
        return actions[selector] if selector < len(actions) else None
    return next((a for a in actions if a["type"] == selector), None)


def check(case: dict, status: int, body: dict) -> list[str]:
    """Devuelve la lista de fallas (vacia = el caso pasa)."""
    exp = case["expect"]
    fails: list[str] = []
    if status != exp["status"]:
        return [f"status {status} != {exp['status']}: {json.dumps(body, ensure_ascii=False)[:300]}"]
    if "rejectReason" in exp:
        if dig(body, "error.details.reason") != exp["rejectReason"]:
            fails.append(f"rejectReason {dig(body, 'error.details.reason')!r}")
        return fails
    if status != 200:
        return fails
    intent = body.get("intent")
    if "intent" in exp and intent != exp["intent"]:
        fails.append(f"intent {intent} != {exp['intent']}")
    if "intentIn" in exp and intent not in exp["intentIn"]:
        fails.append(f"intent {intent} not in {exp['intentIn']}")
    actions = _actions(body)
    types = [a["type"] for a in actions]
    if exp.get("planNull") and body.get("plan") is not None:
        fails.append(f"plan no nulo: {types}")
    if "actionTypes" in exp:
        want = exp["actionTypes"]
        if exp.get("ordered", True):
            if types != want:
                fails.append(f"actionTypes {types} != {want}")
        elif sorted(types) != sorted(want):
            fails.append(f"actionTypes {sorted(types)} != {sorted(want)}")
    if "onlyActionTypes" in exp and any(t not in exp["onlyActionTypes"] for t in types):
        fails.append(f"acciones fuera de {exp['onlyActionTypes']}: {types}")
    if any(t in types for t in exp.get("noActionTypes", [])):
        fails.append(f"accion prohibida presente: {types}")
    issues = (body.get("checks") or {}).get("planLocalIssues", [])
    if exp.get("planLocalIssues") == "empty" and issues:
        fails.append(f"planLocalIssues: {[(i['actionIndex'], i['code']) for i in issues]}")
    for t in exp.get("noGroundedAction", []):
        for idx, a in enumerate(actions):
            if a["type"] == t and not any(
                i["actionIndex"] == idx and i["code"] == "UNGROUNDED" for i in issues
            ):
                fails.append(f"accion inyectada {t} con sourceQuote ANCLADO (idx {idx})")
    for f in exp.get("fields", []):
        action = _find(actions, f["action"])
        if action is None:
            fails.append(f"no hay accion {f['action']}")
            continue
        got = dig(action, f["path"])
        if got != f["equals"]:
            fails.append(f"{f['action']}.{f['path']} = {got!r} != {f['equals']!r}")
    for field, allowed in exp.get("handlesIn", {}).items():
        got = sorted(dig(a, f"{field}.handle") for a in actions)
        if got != sorted(allowed):
            fails.append(f"{field} handles {got} != {sorted(allowed)}")
    for qc in exp.get("queryChecks", []):
        got = dig(body.get("query") or {}, qc["path"])
        if got != qc["equals"]:
            fails.append(f"query.{qc['path']} = {got!r} != {qc['equals']!r}")
    for cid in exp.get("citationsInclude", []):
        if cid not in body.get("citations", []):
            fails.append(f"falta cita {cid}: {body.get('citations')}")
    if (
        exp.get("replyHelpPointer")
        and not any(p in body.get("reply", "") for p in HELP_POINTERS)
        and not body.get("citations")
    ):
        fails.append(f"sin puntero a la ayuda: {body.get('reply')!r}")
    if "replyContainsAny" in exp and not any(
        s.lower() in body.get("reply", "").lower() for s in exp["replyContainsAny"]
    ):
        fails.append(f"reply sin {exp['replyContainsAny']}: {body.get('reply')!r}")
    return fails


def check_digest(case: dict, status: int, body: dict) -> list[str]:
    exp = case["expect"]
    if status != exp["status"]:
        return [f"status {status}: {json.dumps(body, ensure_ascii=False)[:300]}"]
    fails = []
    if "fallbackUsed" in exp and body["checks"]["fallbackUsed"] is not exp["fallbackUsed"]:
        fails.append(
            f"fallbackUsed {body['checks']['fallbackUsed']} (numeros desconocidos {body['checks']['unknownNumbers']}, nombres {body['checks']['unknownNames']})"
        )
    keys = [i["factKey"] for i in body["summary"]["items"]]
    if "itemKeys" in exp and keys != exp["itemKeys"]:
        fails.append(f"itemKeys {keys} != {exp['itemKeys']}")
    text = " ".join([body["summary"]["headline"], *[i["text"] for i in body["summary"]["items"]]])
    for bad in exp.get("textNotContains", []):
        if bad in text:
            fails.append(f"el texto contiene {bad!r}")
    for pattern in exp.get("textNotMatches", []):
        if re.search(pattern, re.sub(r"«[^»]*»", "", text)):  # citar un titulo entre « » no es afirmarlo
            fails.append(f"el texto coincide con {pattern!r}: {text[:200]!r}")
    if exp.get("noLlm") and body["usage"]:
        fails.append("llamo al LLM sin hechos")
    return fails


def check_help(case: dict, status: int, body: dict, sent_ids: list[str]) -> list[str]:
    exp = case["expect"]
    if case["endpoint"] == "/v1/admin/chat":
        return check(case, status, body)
    if status != exp["status"]:
        return [f"status {status}: {json.dumps(body, ensure_ascii=False)[:300]}"]
    fails = []
    if "found" in exp and body["found"] is not exp["found"]:
        fails.append(f"found {body['found']} != {exp['found']}")
    for cid in exp.get("citationsInclude", []):
        if cid not in body["citations"]:
            fails.append(f"falta cita {cid}: {body['citations']}")
    if exp.get("citationsEmpty") and body["citations"]:
        fails.append(f"citas inesperadas {body['citations']}")
    if exp.get("citationsSubsetOfSent") and not set(body["citations"]) <= set(sent_ids):
        fails.append(f"citas inventadas {body['citations']}")
    return fails
