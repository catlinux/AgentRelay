---
description: AgentRelay · estado (ejecutor, modelo, esfuerzo, nivel y sesión)
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Estado de AgentRelay:

!`agentrelay doctor -q 2>&1 | grep -vE 'agentrelay (setup|init|login)|npm install'`

!`agentrelay config`

Resume en 4 líneas como máximo: ejecutor y modelo, esfuerzo, nivel, sesión y cualquier [aviso] o [fallo]. Nada más.
