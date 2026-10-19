"""Bloques de formato de salida del planner (uno por modo). Se inyectan en `$output_format` de admin_planner v1.

Viven en codigo (no en el .md) porque dependen del modo configurado (`planner.mode`), no de la version del prompt.
"""

OUTPUT_FORMAT_SCHEMA = """Devolvé SOLO un JSON, sin texto adicional ni bloques de código, con esta forma:
{"summary": "una oracion", "assumptions": ["supuesto opcional"], "actions": [ ...acciones... ], "clarification": null}

Forma de cada accion (los nombres de campo son exactos; los marcados con ? se omiten si no aplican):
{"type": "CREATE_USER", "ref": "u1", "name": "Nombre Apellido", "email": "persona@dominio.com", "role": "MEMBER | LEADER | ADMIN ?", "sourceQuote": "..."}
{"type": "CREATE_TEAM", "ref": "t1", "name": "Datos", "parent": {"kind": "EXISTING", "handle": "T2"}, "sourceQuote": "..."}
{"type": "SET_TEAM_MEMBER", "team": {"kind": "NEW", "ref": "t1"}, "user": {"kind": "NEW", "ref": "u1"}, "isLead": true, "sourceQuote": "..."}
{"type": "REMOVE_TEAM_MEMBER", "team": {"kind": "EXISTING", "handle": "T2"}, "user": {"kind": "EXISTING", "handle": "U4"}, "sourceQuote": "..."}
{"type": "CREATE_CYCLE", "ref": "c1", "name": "Q1 2027", "kind": "QUARTER", "parent": {"kind": "EXISTING", "handle": "C2"} ?, "startDate": "2027-01-01", "endDate": "2027-03-31", "checkInCadence": "WEEKLY | BIWEEKLY | MONTHLY ?", "committedThreshold": 0.7 ?, "aspirationalThreshold": 0.4 ?, "sourceQuote": "..."}
{"type": "ACTIVATE_CYCLE", "cycle": {"kind": "EXISTING", "handle": "C1"}, "sourceQuote": "..."}
{"type": "CREATE_OBJECTIVE", "ref": "o1", "cycle": {"kind": "EXISTING", "handle": "C1"}, "owner": {"kind": "USER | TEAM", "entity": {"kind": "EXISTING", "handle": "T2"}}, "title": "...", "description": "... ?", "origin": "TOP_DOWN | BOTTOM_UP", "objectiveType": "COMMITTED | ASPIRATIONAL", "parentObjective": {"kind": "EXISTING", "handle": "O3"} ?, "sourceQuote": "..."}
{"type": "CREATE_KEY_RESULT", "ref": "k1", "objective": {"kind": "NEW", "ref": "o1"}, "owner": {"kind": "EXISTING", "handle": "U1"}, "title": "...", "scoring": "DERIVED | MANUAL", "unit": "h ?", "startValue": "8 ?", "targetValue": "4 ?", "sourceQuote": "..."}
{"type": "SET_KEY_RESULT_OWNER", "keyResult": {"kind": "EXISTING", "handle": "K5"}, "owner": {"kind": "EXISTING", "handle": "U2"}, "sourceQuote": "..."}

Si hay ambiguedad: "actions": [], "summary": "" y "clarification": "tu pregunta". Si no, "clarification": null.

Ejemplo completo. Pedido: "creá el equipo Datos dentro de Plataforma, dá de alta a Lucía Gómez ([EMAIL_1]) y que sea la líder" (Plataforma = T2; el email real se reemplazó por el marcador [EMAIL_1], que debés usar tal cual en el campo email):
{"summary": "Voy a crear el equipo Datos dentro de Plataforma, dar de alta a Lucía Gómez y ponerla como líder.", "assumptions": ["Lucía tendrá rol LEADER porque va a liderar un equipo."], "actions": [{"type": "CREATE_TEAM", "ref": "t1", "name": "Datos", "parent": {"kind": "EXISTING", "handle": "T2"}, "sourceQuote": "creá el equipo Datos dentro de Plataforma"}, {"type": "CREATE_USER", "ref": "u1", "name": "Lucía Gómez", "email": "[EMAIL_1]", "role": "LEADER", "sourceQuote": "dá de alta a Lucía Gómez ([EMAIL_1])"}, {"type": "SET_TEAM_MEMBER", "team": {"kind": "NEW", "ref": "t1"}, "user": {"kind": "NEW", "ref": "u1"}, "isLead": true, "sourceQuote": "que sea la líder"}], "clarification": null}"""

OUTPUT_FORMAT_TOOLS = """Respondé SOLO llamando a las herramientas, sin escribir JSON ni texto:
- Una llamada propose_* por accion, en el orden de ejecucion (podes hacer varias llamadas en el mismo turno). En los parametros de entidad pasá el handle del catalogo ("T2") o el ref de una accion anterior ("t1").
- source_quote: el fragmento literal del mensaje de la persona (regla 3).
- Cuando ya propusiste TODAS las acciones, llamá set_plan_summary UNA sola vez (resumen de la regla 11 y supuestos): eso cierra el plan; no llames nada despues. No repitas acciones ya registradas.
- Si el pedido es ambiguo (regla 5), NO llames a propose_*: llamá ask_clarification con tu pregunta.
- Si una herramienta devuelve ok=false, corregí los argumentos y volvé a llamarla."""
