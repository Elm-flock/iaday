import hashlib
import time
from pathlib import Path

import pytest
import yaml

from okr_agent.agent.models import (
    ConfigError,
    estimate_cost_usd,
    family,
    load_models_config,
    validate_families,
)
from okr_agent.api.auth import MAX_SKEW_S, sign, verify_signature
from okr_agent.api.errors import AgentError
from okr_agent.prompts.loader import REQUIRED_PROMPTS, PromptError, PromptStore, parse_prompt
from okr_agent.settings import Settings

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "config" / "models.yaml"


# ----------------------------------------------------------------------------- models.yaml


def test_models_yaml_loads_and_has_verify_comment():
    cfg = load_models_config(MODELS)
    assert set(cfg.tiers) == {"classify", "generate", "regenerate", "planner", "summarize", "judge"}
    assert cfg.readability_min == {"EASY_READ": 65, "PLAIN": 55}
    assert "VERIFICAR en build.nvidia.com" in MODELS.read_text(encoding="utf-8")


def test_env_overrides_models_and_api_base():
    s = Settings(
        _env_file=None,
        agent_model_generate="meta/other-gen",
        agent_model_judge_fallback="mistralai/judge-b",
        nvidia_nim_api_base="http://localhost:9999/v1",
    )
    cfg = load_models_config(MODELS, s)
    assert cfg.tiers["generate"].model == "meta/other-gen"
    assert cfg.tiers["judge"].fallback == "mistralai/judge-b"
    assert cfg.api_base == "http://localhost:9999/v1"


def test_family_is_prefix_before_slash():
    assert family("Meta/Llama-3") == "meta"
    assert family("solo") == "solo"


def test_judge_must_not_share_family_with_generator_model():
    s = Settings(_env_file=None, agent_model_judge="nvidia/judge-x")
    with pytest.raises(ConfigError, match="nvidia"):
        load_models_config(MODELS, s)


def test_judge_fallback_must_not_share_family_with_generator_fallback():
    s = Settings(
        _env_file=None,
        agent_model_generate_fallback="meta/llama-gen",
        agent_model_judge_fallback="meta/llama-judge",
    )
    with pytest.raises(ConfigError, match="meta"):
        load_models_config(MODELS, s)


def test_missing_tier_and_bad_file(tmp_path):
    cfg = load_models_config(MODELS)
    del cfg.tiers["judge"]
    with pytest.raises(ConfigError):
        validate_families(cfg)
    with pytest.raises(ConfigError):
        load_models_config(tmp_path / "nope.yaml")
    bad = tmp_path / "bad.yaml"
    bad.write_text("tiers: 3", encoding="utf-8")
    with pytest.raises(ConfigError):
        load_models_config(bad)


def test_cost_estimate_uses_pricing_and_default():
    cfg = load_models_config(MODELS)
    # nemotron super: 0.30 in / 1.00 out por 1M
    assert estimate_cost_usd(cfg, "nvidia/nemotron-3-super-120b-a12b", 1480, 402) == pytest.approx(0.000846)
    assert estimate_cost_usd(cfg, "desconocido/x", 1_000_000, 0) == pytest.approx(0.5)
    assert estimate_cost_usd(cfg, "desconocido/x", 0, 0) == 0


def test_settings_do_not_hardcode_secrets():
    s = Settings(_env_file=None)
    assert s.nvidia_nim_api_key == "" and s.agent_shared_secret == ""
    assert not s.api_key_configured and not s.langfuse_enabled


# ----------------------------------------------------------------------------- prompts


def test_all_required_prompts_load_with_hash_and_version():
    store = PromptStore(ROOT / "prompts")
    ids = [p.id for p in store.all()]
    assert ids == list(REQUIRED_PROMPTS)
    for p in store.all():
        # sin active.yaml la activa es la version mayor publicada (las anteriores no se editan)
        newest = max(int(f.stem[1:]) for f in (ROOT / "prompts" / p.id).glob("v*.md"))
        raw = (ROOT / "prompts" / p.id / f"v{newest}.md").read_text(encoding="utf-8")
        assert p.version == str(newest)
        assert p.hash == hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
        assert len(p.hash) == 12


def test_render_is_safe_with_json_braces_and_missing_vars():
    store = PromptStore(ROOT / "prompts")
    easy = store.get("easy_read")
    out = easy.render(
        entity_type="CHECK_IN",
        segments_json='[{"key": "a", "text": "$100 {x}"}]',
        correction_note="",
    )
    assert '{"segments": [{"key": "...", "text": "..."}]' in out  # llaves del prompt intactas
    assert "$100 {x}" in out  # el contenido del usuario no se re-interpreta
    assert "$entity_type" not in out
    assert "$correction_note" not in out
    # variable no provista -> queda tal cual, sin explotar
    assert "$segments_json" in easy.render(entity_type="X")


def _write_prompt(base: Path, pid: str, version: int, body: str = "hola $x") -> Path:
    d = base / pid
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"v{version}.md"
    f.write_text(f'---\nid: {pid}\nversion: "{version}"\ntier: generate\n---\n{body}\n', encoding="utf-8")
    return f


def _full_dir(tmp_path: Path) -> Path:
    for pid in REQUIRED_PROMPTS:
        _write_prompt(tmp_path, pid, 1)
    return tmp_path


def test_highest_version_wins_and_active_yaml_pins(tmp_path):
    _full_dir(tmp_path)
    _write_prompt(tmp_path, "judge", 2, "v2 $x")
    assert PromptStore(tmp_path).get("judge").version == "2"
    (tmp_path / "active.yaml").write_text(yaml.safe_dump({"judge": "1"}), encoding="utf-8")
    assert PromptStore(tmp_path).get("judge").version == "1"
    (tmp_path / "active.yaml").write_text(yaml.safe_dump({"judge": "9"}), encoding="utf-8")
    with pytest.raises(PromptError, match="inexistente"):
        PromptStore(tmp_path)


def test_missing_required_prompt_and_bad_front_matter(tmp_path):
    _write_prompt(tmp_path, "classify", 1)
    with pytest.raises(PromptError, match="Faltan prompts"):
        PromptStore(tmp_path)
    bad = tmp_path / "bad.md"
    bad.write_text("sin front matter", encoding="utf-8")
    with pytest.raises(PromptError):
        parse_prompt(bad)
    with pytest.raises(PromptError):
        PromptStore(tmp_path / "no-existe")


def test_prompt_id_must_match_folder(tmp_path):
    _full_dir(tmp_path)
    f = tmp_path / "judge" / "v1.md"
    f.write_text(f.read_text(encoding="utf-8").replace("id: judge", "id: otro"), encoding="utf-8")
    with pytest.raises(PromptError, match="carpeta"):
        PromptStore(tmp_path)


def test_hash_changes_when_prompt_changes(tmp_path):
    f = _write_prompt(tmp_path, "classify", 1, "uno")
    h1 = parse_prompt(f).hash
    f.write_text(f.read_text(encoding="utf-8").replace("uno", "dos"), encoding="utf-8")
    assert parse_prompt(f).hash != h1


# ----------------------------------------------------------------------------- HMAC

SECRET = "k" * 40
TID = "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10"


def _valid(now=None, body=b'{"a":1}'):
    ts = str(int(now if now is not None else time.time()))
    return ts, sign(SECRET, ts, body), body


def test_sign_matches_contract_formula():
    import hashlib as h
    import hmac as m

    ts, body = "1792339200", '{"x":"ñ"}'.encode()
    expected = "sha256=" + m.new(SECRET.encode(), b"1792339200." + body, h.sha256).hexdigest()
    assert sign(SECRET, ts, body) == expected
    assert expected.startswith("sha256=") and expected == expected.lower()


def test_valid_signature_returns_normalized_trace_id():
    ts, sig, body = _valid()
    assert verify_signature(SECRET, ts, sig, TID.upper(), body) == TID


@pytest.mark.parametrize("missing", ["timestamp", "signature", "trace"])
def test_missing_headers_rejected(missing):
    ts, sig, body = _valid()
    args = {"timestamp": ts, "signature": sig, "trace": TID}
    args[missing] = None
    with pytest.raises(AgentError) as e:
        verify_signature(SECRET, args["timestamp"], args["signature"], args["trace"], body)
    assert e.value.code == "UNAUTHORIZED" and e.value.status == 401 and not e.value.retryable


def test_bad_signature_wrong_secret_and_tampered_body_rejected():
    ts, sig, body = _valid()
    with pytest.raises(AgentError):
        verify_signature(SECRET, ts, sig[:-1] + ("0" if sig[-1] != "0" else "1"), TID, body)
    with pytest.raises(AgentError):
        verify_signature("otro" * 12, ts, sig, TID, body)
    with pytest.raises(AgentError):
        verify_signature(SECRET, ts, sig, TID, body + b" ")


def test_signature_must_be_over_exact_bytes_not_reserialized_json():
    ts = str(int(time.time()))
    body = b'{"a": 1,   "b":2}'  # espacios raros: re-serializar cambiaria los bytes
    sig = sign(SECRET, ts, body)
    assert verify_signature(SECRET, ts, sig, TID, body) == TID
    with pytest.raises(AgentError):
        verify_signature(SECRET, ts, sig, TID, b'{"a":1,"b":2}')


def test_skew_boundaries():
    now = 1_800_000_000
    for delta, ok in (
        (0, True),
        (MAX_SKEW_S, True),
        (MAX_SKEW_S + 1, False),
        (-MAX_SKEW_S, True),
        (-(MAX_SKEW_S + 1), False),
    ):
        ts, sig, body = _valid(now=now - delta)
        if ok:
            assert verify_signature(SECRET, ts, sig, TID, body, now=now) == TID
        else:
            with pytest.raises(AgentError):
                verify_signature(SECRET, ts, sig, TID, body, now=now)


@pytest.mark.parametrize("bad_trace", ["no-es-uuid", "123", ""])
def test_invalid_trace_id_rejected(bad_trace):
    ts, sig, body = _valid()
    with pytest.raises(AgentError):
        verify_signature(SECRET, ts, sig, bad_trace, body)


def test_non_numeric_timestamp_and_empty_secret_rejected():
    _, sig, body = _valid()
    with pytest.raises(AgentError):
        verify_signature(SECRET, "abc", sig, TID, body)
    ts, sig2, body = _valid()
    with pytest.raises(AgentError):
        verify_signature("", ts, sign("", ts, body), TID, body)


def test_classify_v2_is_active_and_v1_is_untouched():
    store = PromptStore(ROOT / "prompts")
    assert store.get("classify").version == "2"
    v1 = (ROOT / "prompts" / "classify" / "v1.md").read_text(encoding="utf-8")
    assert hashlib.sha256(v1.encode("utf-8")).hexdigest()[:12] == "58fdfdf650be"  # hash publicado de v1


def test_model_options_from_repo_config():
    cfg = load_models_config(MODELS)
    super_opts = cfg.options_for("nvidia/nemotron-3-super-120b-a12b")
    assert super_opts.extra_body == {"chat_template_kwargs": {"enable_thinking": False}}
    assert cfg.options_for("google/diffusiongemma-26b-a4b-it").json_mode == "schema"  # default
    assert cfg.options_for("modelo/desconocido").extra_body is None


def test_litellm_options_json_modes():
    from okr_agent.agent.llm_factory import litellm_options
    from okr_agent.agent.models import ModelOptions

    cfg = load_models_config(MODELS)
    cfg.model_options["m/schema"] = ModelOptions()
    cfg.model_options["m/object"] = ModelOptions(json_mode="object")
    cfg.model_options["m/none"] = ModelOptions(json_mode="none", extra_body={"a": 1})
    assert litellm_options(cfg, "m/schema") == {}  # ADK manda json_schema
    assert litellm_options(cfg, "m/object") == {"response_format": {"type": "json_object"}}
    assert litellm_options(cfg, "m/none") == {"response_format": None, "extra_body": {"a": 1}}


def test_litellm_factory_applies_options_to_litellm_instance():
    from okr_agent.agent.llm_factory import make_litellm_factory

    cfg = load_models_config(MODELS)
    llm = make_litellm_factory(Settings(_env_file=None, nvidia_nim_api_key="k"), cfg)(
        "nvidia/nemotron-3-super-120b-a12b"
    )
    assert llm._additional_args["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}}


def test_repo_config_roles_and_invariants():
    cfg = load_models_config(MODELS)  # valida familias (juez != generador)
    for tier in ("classify", "generate", "judge"):
        t = cfg.tiers[tier]
        assert t.model != t.fallback
    assert family(cfg.tiers["judge"].model) != family(cfg.tiers["generate"].model)
