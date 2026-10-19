"""Unidades de la extension admin: texto no confiable, grounding, BM25, digest, modelos del plan, planner tools, config."""

import copy
import types
from pathlib import Path

import pytest
from pydantic import ValidationError

from okr_agent.agent.admin import digest_logic, planner_tools
from okr_agent.agent.admin.local_checks import admin_messages, check_plan
from okr_agent.agent.admin.plan_models import EntityRef, Plan, PlannerOut, ReadQuery
from okr_agent.agent.admin.text import normalize, quote_in_messages, render_catalog, sanitize_untrusted
from okr_agent.agent.models import load_models_config
from okr_agent.agent.usage import current_run
from okr_agent.api.admin_schemas import AdminChatRequest, Catalog, ChatTurn, DigestFacts
from okr_agent.guards import bm25
from okr_agent.settings import Settings
from tests.admin.helpers import CATALOG, CHUNKS, PLAN, chat_body
from tests.admin.test_digest_and_help import FACTS

ROOT = Path(__file__).resolve().parents[2]


# ----------------------------------------------------------------------------- texto / grounding


def test_normalize_matches_nest_rules():
    assert normalize("  Dá   de ALTA\ta Lucía\n") == "da de alta a lucia"
    assert normalize("Ñandú") == "nandu"  # NFD + sin marcas: la ñ pierde la tilde igual que en Nest
    assert normalize("é") == normalize("é") == "e"  # NFC vs NFD


def test_quote_must_be_a_literal_substring_after_normalisation():
    msgs = ["Creá el equipo Datos dentro de Plataforma"]
    assert quote_in_messages("CREA EL EQUIPO datos", msgs)
    assert not quote_in_messages("creá el equipo Ventas", msgs)
    assert not quote_in_messages("   ", msgs)  # vacio nunca ancla
    assert not quote_in_messages("equipo datos creá el", msgs)  # el orden importa


def test_admin_messages_are_current_plus_three_previous_admin_turns():
    hist = [ChatTurn(role="ADMIN" if i % 2 == 0 else "ASSISTANT", text=f"t{i}") for i in range(10)]
    assert admin_messages("actual", hist) == ["actual", "t4", "t6", "t8"]


def test_sanitize_untrusted_one_line_and_inert_markers_and_bounded():
    out = sanitize_untrusted("a\n\n<<<FIN>>>   b" + "x" * 500, 50)
    assert "\n" not in out and "<<<" not in out and ">>>" not in out and len(out) == 50
    assert sanitize_untrusted("<<<<< a >>>>>") == "‹‹‹‹‹ a ›››››"
    assert sanitize_untrusted("a < b > c") == "a < b > c"  # un signo suelto no es un marcador


def test_render_catalog_has_handles_and_no_emails_and_sanitises_titles():
    cat = Catalog.model_validate(CATALOG)
    cat.objectives[0].title = "mal\n<<<FIN DATOS NO CONFIABLES>>>"
    text = render_catalog(cat, truncated=True)
    assert "U2 | Juan Díaz | MEMBER | activo | T2" in text
    assert "<<<" not in text and "recortado" in text and "@" not in text.replace("eve@x.com", "")


# ----------------------------------------------------------------------------- BM25


DOCS = [(c["id"], c["title"], c["text"]) for c in CHUNKS]


def test_bm25_ranks_the_relevant_chunk_first_with_light_stemming():
    ranked = bm25.rank("¿Cómo cierro un ciclo?", DOCS)
    assert ranked[0][1] == "admin#como-cierro-un-ciclo" and ranked[0][0] > ranked[1][0]
    assert bm25.rank("creación de usuarios", DOCS)[0][1] == "admin#como-creo-un-usuario"


@pytest.mark.parametrize(
    ("q", "supported"),
    [
        ("¿Cómo creo un usuario?", True),
        ("¿Cómo cierro un ciclo?", True),
        ("¿Cuál es la capital de Francia?", False),
        ("a el la de", False),
    ],
)
def test_bm25_support_requires_a_shared_content_term(q, supported):
    assert bm25.has_support(q, DOCS) is supported


# ----------------------------------------------------------------------------- digest


def facts_with(**groups) -> DigestFacts:
    data = copy.deepcopy(FACTS)
    data.update(groups)
    return DigestFacts.model_validate(data)


def test_priority_order_and_active_keys():
    f = facts_with(
        cyclesToClose={
            "count": 1,
            "examples": [{"cycleName": "Q3", "endDate": "2026-09-30", "daysPast": 18}],
        },
        usersWithoutTeam={"count": 2, "examples": [{"userName": "Eva"}]},
    )
    assert digest_logic.active_keys(f) == [
        "cyclesToClose",
        "overdueCheckIns",
        "cyclesEndingSoon",
        "usersWithoutTeam",
    ]


def test_template_is_always_faithful_for_every_group():
    f = DigestFacts.model_validate(
        {
            "overdueCheckIns": {
                "count": 3,
                "examples": [
                    {"krTitle": "K uno", "objectiveTitle": "O", "ownerName": "Ana Pérez", "daysOverdue": 4}
                ],
            },
            "krsInRed": {
                "count": 2,
                "examples": [{"krTitle": "K dos", "objectiveTitle": "O", "ownerName": "Juan Díaz"}],
            },
            "cyclesEndingSoon": {
                "count": 2,
                "examples": [{"cycleName": "Q4 2026", "endDate": "2026-12-31", "daysLeft": 9}],
            },
            "cyclesToClose": {
                "count": 1,
                "examples": [{"cycleName": "Q3 2026", "endDate": "2026-09-30", "daysPast": 18}],
            },
            "draftsNotPublishable": {
                "count": 5,
                "examples": [
                    {"objectiveTitle": "Obj", "ownerName": "Eva", "krCount": 2, "ownerObjectiveCount": 1}
                ],
            },
            "usersWithoutTeam": {"count": 1, "examples": [{"userName": "Luis"}]},
            "teamsWithoutLead": {"count": 4, "examples": [{"teamName": "Datos"}]},
            "adaptationsNeedingReview": {"count": 6},
            "adaptationRequestsOpen": {"count": 3, "overdueCount": 1, "unassignedCount": 2, "examples": []},
            "recentSensitiveChanges": {
                "count": 2,
                "examples": [
                    {
                        "action": "USER_ROLE_CHANGED",
                        "actorName": "Ana Pérez",
                        "entityLabel": "Juan Díaz",
                        "at": "2026-10-17T10:00:00Z",
                    }
                ],
            },
        }
    )
    summary = digest_logic.template_summary(f)
    keys = digest_logic.active_keys(f)
    assert [i["factKey"] for i in summary["items"]] == keys[: digest_logic.MAX_ITEMS] and len(keys) == 10
    assert len(summary["items"]) == 8 and "10 temas" in summary["headline"]
    check = digest_logic.check_summary(summary, f, keys)
    assert check["unknown_numbers"] == [] and check["unknown_names"] == []
    assert all(len(i["text"]) <= 300 for i in summary["items"])


def test_numbers_are_checked_per_group_so_swapped_numbers_are_caught():
    f = facts_with()
    keys = digest_logic.active_keys(f)  # overdueCheckIns (7, 12 dias) y cyclesEndingSoon (1, 10 dias)
    swapped = {
        "headline": "Hay 2 temas para revisar hoy.",
        "items": [
            {
                "factKey": "overdueCheckIns",
                "text": "7 resultados clave vencidos; el peor con 10 días.",
            },  # 10 es del otro grupo
            {"factKey": "cyclesEndingSoon", "text": "El ciclo Q4 2026 termina en 10 días."},
        ],
    }
    assert digest_logic.check_summary(swapped, f, keys)["unknown_numbers"] == ["10"]


def test_dates_and_thousands_formats_count_as_known_numbers():
    f = facts_with()
    keys = digest_logic.active_keys(f)
    s = {
        "headline": "Hay 2 temas.",
        "items": [
            {"factKey": "overdueCheckIns", "text": "7 resultados vencidos, uno con 12 días."},
            {"factKey": "cyclesEndingSoon", "text": "Q4 2026 termina el 28 de octubre de 2026, en 10 días."},
        ],
    }
    assert digest_logic.check_summary(s, f, keys)["problems"] == []


def test_unknown_names_ignore_acronyms_months_and_sentence_starts():
    f = facts_with()
    text = "El ciclo Q4 2026 termina en octubre. Hay que revisar los OKR. Responsable: Pedro Gómez, de Juan Díaz."
    # Q4/OKR (siglas), octubre (mes) y los inicios de oracion se ignoran; Pedro y Gómez no estan en los ejemplos
    assert digest_logic.unknown_names_in(text, f, "overdueCheckIns") == ["Pedro", "Gómez"]
    ok = "7 resultados vencidos. El más atrasado es «Bajar el tiempo de respuesta», de Juan Díaz."
    assert digest_logic.unknown_names_in(ok, f, "overdueCheckIns") == []


# ----------------------------------------------------------------------------- modelos del plan


def test_plan_models_accept_the_contract_example_and_serialise_camel_case():
    plan = Plan.model_validate(PLAN)
    dumped = plan.model_dump(by_alias=True, exclude_none=True, mode="json")
    assert dumped["actions"][2]["isLead"] is True and dumped["actions"][0]["sourceQuote"]
    assert "role" not in dumped["actions"][0]


def test_entity_ref_must_be_coherent():
    EntityRef.model_validate({"kind": "EXISTING", "handle": "T3"})
    EntityRef.model_validate({"kind": "NEW", "ref": "t1"})
    for bad in (
        {"kind": "EXISTING", "ref": "t1"},
        {"kind": "NEW", "handle": "T3"},
        {"kind": "EXISTING", "handle": "t3"},
        {"kind": "NEW", "ref": "T1"},
        {"kind": "NEW", "ref": "1a"},
    ):
        with pytest.raises(ValidationError):
            EntityRef.model_validate(bad)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p["actions"][0].update(type="DELETE_TEAM"),  # fuera de la whitelist
        lambda p: p["actions"][0].update(password="x"),  # campo prohibido
        lambda p: p["actions"][0].update(sourceQuote="ab"),  # < 3 chars
        lambda p: p["actions"][0].update(sourceQuote="x" * 201),
        lambda p: p["actions"][0].pop("ref"),  # CREATE_* sin ref
        lambda p: p["actions"][2].update(ref="x1"),  # ref prohibido en SET_TEAM_MEMBER
        lambda p: p.update(actions=[]),
        lambda p: p.update(summary=""),
        lambda p: p.update(assumptions=["a"] * 6),
    ],
)
def test_plan_models_reject_invalid_plans(mutate):
    p = copy.deepcopy(PLAN)
    mutate(p)
    with pytest.raises(ValidationError):
        Plan.model_validate(p)


def test_create_cycle_and_objective_field_rules():
    cyc = {
        "type": "CREATE_CYCLE",
        "ref": "c1",
        "name": "Q1 2027",
        "kind": "QUARTER",
        "startDate": "2027-01-01",
        "endDate": "2027-03-31",
        "committedThreshold": 0.7,
        "sourceQuote": "ciclo Q1",
    }
    ok = {"summary": "s", "actions": [cyc]}
    Plan.model_validate(ok)
    for patch in (
        {"committedThreshold": 0.705},
        {"committedThreshold": 1.5},
        {"startDate": "1/1/2027"},
        {"kind": "MONTH"},
    ):
        with pytest.raises(ValidationError):
            Plan.model_validate({"summary": "s", "actions": [{**cyc, **patch}]})
    obj = {
        "type": "CREATE_OBJECTIVE",
        "ref": "o1",
        "cycle": {"kind": "EXISTING", "handle": "C1"},
        "owner": {"kind": "TEAM", "entity": {"kind": "EXISTING", "handle": "T2"}},
        "title": "Mejorar",
        "origin": "TOP_DOWN",
        "objectiveType": "COMMITTED",
        "sourceQuote": "objetivo Mejorar",
    }
    Plan.model_validate({"summary": "s", "actions": [obj]})
    with pytest.raises(
        ValidationError
    ):  # `type` COMMITTED no puede convivir con el discriminador: va como objectiveType
        Plan.model_validate({"summary": "s", "actions": [{**obj, "objectiveType": "OTRO"}]})


def test_planner_out_needs_actions_or_a_question():
    with pytest.raises(ValidationError):
        PlannerOut.model_validate({"summary": "x", "actions": []})
    assert PlannerOut.model_validate({"clarification": "¿Cuál?"}).is_clarification


def test_read_query_uses_from_alias_and_limits():
    q = ReadQuery.model_validate(
        {"type": "AUDIT_SEARCH", "from": "2026-10-01", "limit": 20, "sourceQuote": "quién cambió"}
    )
    assert q.from_ == "2026-10-01" and q.model_dump(by_alias=True, exclude_none=True)["from"] == "2026-10-01"
    for bad in ({"limit": 21}, {"limit": 0}, {"type": "ADAPTATION_REQUESTS_LIST"}, {"action": "lower"}):
        with pytest.raises(ValidationError):
            ReadQuery.model_validate({"type": "AUDIT_SEARCH", "sourceQuote": "quién cambió", **bad})


def test_chat_request_rejects_more_than_ten_turns_and_handle_prefix_mismatch():
    with pytest.raises(ValidationError):
        AdminChatRequest.model_validate(chat_body(history=[{"role": "ADMIN", "text": "x"}] * 11))
    cat = copy.deepcopy(CATALOG)
    cat["teams"][0]["handle"] = "U1"
    with pytest.raises(ValidationError):
        AdminChatRequest.model_validate(chat_body(catalog=cat))


def test_local_check_limits_issue_per_unknown_cycle_activation():
    cat = Catalog.model_validate(CATALOG)
    plan = Plan.model_validate(
        {
            "summary": "s",
            "actions": [
                {
                    "type": "ACTIVATE_CYCLE",
                    "cycle": {"kind": "EXISTING", "handle": "C1"},
                    "sourceQuote": "activá",
                }
            ],
        }
    )
    issues = check_plan(plan, cat, ["activá el ciclo"])
    assert [i.code for i in issues] == ["CYCLE_NOT_EDITABLE"]  # C1 ya esta ACTIVE


def test_parent_objective_must_be_published():
    cat = Catalog.model_validate(CATALOG)
    base = {
        "type": "CREATE_OBJECTIVE",
        "ref": "o1",
        "cycle": {"kind": "EXISTING", "handle": "C1"},
        "owner": {"kind": "USER", "entity": {"kind": "EXISTING", "handle": "U2"}},
        "title": "Nuevo",
        "origin": "TOP_DOWN",
        "objectiveType": "COMMITTED",
        "sourceQuote": "objetivo Nuevo",
    }
    for parent, expected in (("O1", []), ("O2", ["PARENT_NOT_PUBLISHED"])):
        plan = Plan.model_validate(
            {"summary": "s", "actions": [{**base, "parentObjective": {"kind": "EXISTING", "handle": parent}}]}
        )
        assert [i.code for i in check_plan(plan, cat, ["objetivo Nuevo"])] == expected


def test_derived_kr_needs_target_and_manual_kr_cannot_have_values():
    cat = Catalog.model_validate(CATALOG)

    def kr(**over):
        a = {
            "type": "CREATE_KEY_RESULT",
            "ref": "k1",
            "objective": {"kind": "EXISTING", "handle": "O1"},
            "owner": {"kind": "EXISTING", "handle": "U2"},
            "title": "KR",
            "scoring": "DERIVED",
            "sourceQuote": "un KR",
            **over,
        }
        return Plan.model_validate({"summary": "s", "actions": [a]})

    assert [i.code for i in check_plan(kr(), cat, ["un KR"])] == ["DTO_INVALID"]
    assert check_plan(kr(startValue="8", targetValue="4"), cat, ["un KR"]) == []
    assert [i.code for i in check_plan(kr(scoring="MANUAL", targetValue="4"), cat, ["un KR"])] == [
        "DTO_INVALID"
    ]


# ----------------------------------------------------------------------------- planner tools (record-only)


def _with_run(coro_factory):
    import asyncio

    async def go():
        run = types.SimpleNamespace(scratch={})
        token = current_run.set(run)
        try:
            return await coro_factory(run)
        finally:
            current_run.reset(token)

    return asyncio.run(go())


def test_planner_tools_only_record_and_assemble_deterministically():
    async def scenario(run):
        r1 = await planner_tools.propose_create_team("t1", "Datos", "T2", "creá el equipo Datos")
        r2 = await planner_tools.propose_set_team_member("t1", "U3", True, "que sea la líder")
        await planner_tools.set_plan_summary("Voy a crear Datos.", ["supuesto"])
        return r1, r2, planner_tools.assemble(), run.scratch

    r1, r2, out, scratch = _with_run(scenario)
    assert r1 == {"ok": True, "position": 1} and r2 == {"ok": True, "position": 2}
    assert [a.type for a in out.actions] == ["CREATE_TEAM", "SET_TEAM_MEMBER"]
    assert out.actions[1].team.kind == "NEW" and out.actions[1].user.handle == "U3"
    assert out.summary == "Voy a crear Datos." and out.assumptions == ["supuesto"]
    assert set(scratch) == {"planner"}  # nada mas que estado en memoria del pedido


def test_planner_tools_validate_args_cap_actions_and_block_after_clarification():
    async def scenario(run):
        bad = await planner_tools.propose_create_user("u1", "Eva", "eva@x.com", "cita", role="BOSS")
        for i in range(25):
            await planner_tools.propose_create_team(f"t{i}", "E", "T1", "cita")
        over = await planner_tools.propose_create_team("t99", "E", "T1", "cita")
        return bad, over

    bad, over = _with_run(scenario)
    assert bad["ok"] is False and "invalidos" in bad["error"]
    assert over["ok"] is False and "25" in over["error"]

    async def scenario2(run):
        await planner_tools.ask_clarification("¿Cuál?")
        blocked = await planner_tools.propose_create_team("t1", "E", "T1", "cita")
        return blocked, planner_tools.assemble()

    blocked, out = _with_run(scenario2)
    assert blocked["ok"] is False and out.is_clarification and out.actions == []


def test_planner_tools_assemble_without_actions_raises():
    async def scenario(run):
        return planner_tools.assemble()

    with pytest.raises(ValidationError):
        _with_run(scenario)


def test_entity_string_is_handle_or_ref():
    assert planner_tools._entity("T2") == {"kind": "EXISTING", "handle": "T2"}
    assert planner_tools._entity("t1") == {"kind": "NEW", "ref": "t1"}
    assert planner_tools._entity("") is None


# ----------------------------------------------------------------------------- config


def test_real_models_yaml_has_planner_and_summarize_tiers():
    cfg = load_models_config(ROOT / "config" / "models.yaml")
    assert cfg.planner_tier() == "planner" and cfg.summarize_tier() == "summarize"
    assert cfg.tiers["planner"].model == "nvidia/nemotron-3-ultra-550b-a55b"
    assert cfg.tiers["summarize"].model == "nvidia/nemotron-3-super-120b-a12b"
    assert cfg.planner_mode() in ("schema", "tools")
    # modo schema: fallback super; modo tools: tools_fallback
    cfg.tiers["planner"].mode = "schema"
    assert cfg.fallback_for("planner") == "nvidia/nemotron-3-super-120b-a12b"
    cfg.tiers["planner"].mode = "tools"
    assert cfg.fallback_for("planner") == "google/diffusiongemma-26b-a4b-it"
    assert cfg.fallback_for("generate") == cfg.tiers["generate"].fallback


def test_planner_mode_env_override_and_model_overrides():
    s = Settings(
        _env_file=None,
        agent_planner_mode="tools",
        agent_model_planner="x/y",
        agent_model_summarize_fallback="x/z",
    )
    cfg = load_models_config(ROOT / "config" / "models.yaml", s)
    assert cfg.planner_mode() == "tools" and cfg.tiers["planner"].model == "x/y"
    assert cfg.tiers["summarize"].fallback == "x/z"


def test_without_planner_tier_the_generate_tier_is_used():
    cfg = load_models_config(ROOT / "tests" / "fixtures" / "models.test.yaml")
    assert (
        cfg.planner_tier() == "generate"
        and cfg.summarize_tier() == "generate"
        and cfg.planner_mode() == "schema"
    )


def test_planner_family_may_equal_judge_family_but_generator_may_not():
    # el juez (google) no se usa en los pipelines admin: el fallback google del planner/summarize es valido
    load_models_config(ROOT / "config" / "models.yaml")


def test_health_lists_admin_tiers_and_prompts(ah_tools):
    body = ah_tools.client.get("/health").json()
    assert body["models"]["planner"] == {
        "model": "fam-p/planner-primary",
        "fallback": "fam-p/planner-tools-fallback",  # fallback efectivo del modo tools
    }
    assert "summarize" in body["models"]
    ids = [p["id"] for p in body["prompts"]]
    assert {
        "admin_classify",
        "admin_planner",
        "admin_query",
        "admin_reply",
        "help_answer",
        "digest_summary",
    } <= set(ids)


def test_admin_prompts_are_versioned_and_have_hash(ah):
    for pid in (
        "admin_classify",
        "admin_planner",
        "admin_query",
        "admin_reply",
        "help_answer",
        "digest_summary",
    ):
        p = ah.prompts.get(pid)
        expected = "2" if pid in ("admin_classify", "admin_planner") else "1"
        assert p.version == expected and len(p.hash) == 12
