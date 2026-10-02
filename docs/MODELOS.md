# Modelos, ejecutores y cuentas de AgentRelay

Documento de referencia, escrito el **2026-10-02**. Recoge lo que hay instalado y disponible, dónde corre cada cosa, cuánto cuesta y qué se ha probado de verdad. Lo que no se ha probado se marca como **sin probar**; nada de lo que sigue es una promesa de calidad.

La lista viva y completa de modelos está siempre al final de tu archivo `~/.agentrelay/config.json` (se actualiza con `agentrelay config refresh`).

## 1. Cómo se reparten los papeles

| Papel | Qué hace | Quién puede serlo hoy |
|---|---|---|
| **Orquestador** | Entiende lo que pides, planifica, reparte el trabajo, revisa y decide. | Claude Code (Opus 5.5, Sonnet 5.5). LongCat 2.5 desde opencode (cuota agotada; promoción hasta el 10/10). |
| **Ejecutor** | Escribe el código que le manda el orquestador y devuelve un informe. | Un modelo de uno de los 3 tipos: `codex`, `cline` u `opencode`. |

El orquestador no gasta tokens escribiendo código: eso es justo lo que se delega para ahorrar cuota.

## 2. Qué se gasta y de dónde

| Cuenta | Qué la gasta | Cómo se paga | Estado conocido |
|---|---|---|---|
| Suscripción de Claude | El orquestador Claude Code | Cuota de la suscripción | Limitada; se reserva para decidir y revisar. |
| API de OpenAI | Ejecutor `codex` (Luna y compañía) | Pago por uso con tu clave de API | Funciona. Una tarea pequeña de prueba costó céntimos. Mira el panel de OpenAI para el gasto real. |
| API de DeepSeek | Ejecutor `cline` | Pago por uso con tu clave | Funciona. Pro a la primera; Flash se atascó una vez y luego fue bien. |
| Cuota mensual gratuita de Ollama (nube) | Modelos `ollama/...:cloud` | Gratis con límites mensuales | Marcaba 0 % usado. Se reinicia cada 4 semanas. |
| Modelos gratuitos de OpenCode | Modelos `opencode/...-free` | Gratis con cuotas por hora o día | Se agotan: pasó con LongCat y con Nemotron en una tarea larga. |
| Tu ordenador | Modelos `ollama/` locales | Gratis, sin límite | Usan tu procesador y tu memoria. |

Aviso importante: al guardar la clave de API en Codex se **sustituye la sesión de ChatGPT**. Cuando vuelva el plan gratuito (24/10) habrá que volver a iniciar sesión con `agentrelay login`.

## 3. Ejecutor `codex` (OpenAI)

| Modelo | Esfuerzos | Notas |
|---|---|---|
| **gpt-6-luna** | bajo, medio, alto, extremo, máximo | El que se usa en este proyecto (esfuerzo bajo). Probado muchas veces. |
| gpt-5.6-terra | hasta «ultra» | Sin probar. |
| gpt-5.6-luna | bajo a máximo | Sin probar. |
| gpt-5.5 | bajo a extremo | Sin probar. |

Problemas conocidos en Windows: el sandbox protegido de Codex puede romperse («apply deny-read ACLs»). La solución aplicada en este proyecto es el argumento extra `-c windows.sandbox=unelevated`. Su sandbox tampoco le deja ejecutar `npm test`, así que sus informes dicen «partial» y el orquestador debe pasar las pruebas.

## 4. Ejecutor `cline` (DeepSeek)

| Modelo | Notas |
|---|---|
| deepseek-v4-pro | Probado, fiable. Más caro. |
| deepseek-v4-flash | Más barato. Una vez se quedó esperando a la API; otra vez terminó una tarea en 3 minutos. |

`agentrelay pricing` muestra las tarifas de DeepSeek y sus horas punta y valle.

## 5. Ejecutor `opencode`: 52 modelos en cuatro grupos

### 5.1 Gratuitos de OpenCode (terminan en `-free`)

Se probaron con **la misma tarea** (un módulo pequeño con 26 comprobaciones ocultas) el 2026-10-01. Es una sola tarea: no vale como veredicto definitivo.

| Modelo | Tiempo | Pruebas ocultas | Resultado |
|---|---|---|---|
| **nemotron-3-ultra-free** | 174 s | **26/26** | El más fiable. Elegido. |
| space-bunny-free | 126 s | 26/26 | Bueno. |
| mimo-v2.6-flash-free | 60 s | 25/26 | El más rápido. |
| longcat-2.5-preview-free | 147 s | 26/26 | Código correcto pero errores de API y cuota agotada. |
| nemotron-3.5-lightning-free | — | — | Falló la validación y se colgó. |
| fledge-alpha-free | 8 s | — | Falla al instante. |
| ling-3.0-flash-fin-free | 5 s | — | Falla al instante. |
| muse-spark-1.3-contributor-free | — | — | Sin probar. |

### 5.2 Ollama en la nube (gratis con tu cuota mensual)

| Modelo | Estado |
|---|---|
| ollama/nemotron-3-ultra:cloud | Probado que escribe archivos con herramientas. Lento en una tarea larga. |
| ollama/gpt-oss:120b-cloud | Registrado, sin probar. |
| ollama/gemma4:31b-cloud | Registrado, sin probar. |

En tu lista gratuita de Ollama también están `nemotron-3-super` y `nemotron-3-nano:30b`, pero **no están registrados** (se hace con `ollama pull <modelo>:cloud`).

### 5.3 Ollama local (en tu ordenador)

qwen2.5-coder:7b, qwen3:8b, llama3.1:8b y llama3.1:latest, gemma2:9b, gemma3:4b, mistral-nemo:12b, aya-expanse:8b, llama3.2-vision, qwen2.5:3b y qwen2.5:1.5b. **Sin probar.** Opinión, no dato: son pequeños para trabajar como agente que edita archivos. `aratan/Ternary-Bonsai-2-27B` aparece en Ollama pero opencode no lo ve.

### 5.4 De pago por uso en OpenCode

claude-opus-5-5, claude-sonnet-5-5, claude-haiku-4-5, claude-fable-5-1, gpt-5.5, gpt-5.5-pro, gpt-5.6-terra, gpt-6-astra, gpt-6-luna, gpt-6.1-sol, gpt-5.3-codex, gpt-5.4-mini, gpt-5.4-nano, gemini-3.1-pro, gemini-3.5-flash-lite, gemini-3.8-flash, grok-4.7, grok-build-0.1, kimi-k3, kimi-k2.7-code, glm-5.3, glm-5.3-flash, minimax-m3, muse-spark-1.3, qwen3.6-plus, qwen3.8-flash, deepseek-v4-pro, deepseek-v4.1-flash y big-pickle. **Sin probar; no se conocen sus precios ni tu saldo en OpenCode.**

## 6. Configuración actual (a 2026-10-02)

| Carpeta | Ejecutor | Modelo | Esfuerzo |
|---|---|---|---|
| AgentRelay (este proyecto) | codex | gpt-6-luna | bajo (más `windows.sandbox=unelevated`) |
| Taller | opencode | nemotron-3-ultra-free (fijado el 01/10; compruébalo con `agentrelay doctor`) | — |
| Valor global por defecto | codex | gpt-6-luna | por defecto del modelo |

## 7. Cómo cambiar (en la terminal, dentro de la carpeta del proyecto)

```
agentrelay set --local executor opencode
agentrelay set --local model opencode/nemotron-3-ultra-free
agentrelay set --local effort bajo
agentrelay doctor
agentrelay models
agentrelay config refresh
```

`--local` guarda el cambio solo en ese proyecto (archivo `agentrelay.config.json`). Sin `--local` vale para todos. El archivo global y el del proyecto se pueden editar a mano: tienen cada opción explicada.

## 8. Problemas conocidos y qué hacer

| Síntoma | Causa | Qué hacer |
|---|---|---|
| «✖ error:» vacío repetido en `watch` | Cuota o límite de un modelo gratuito; el ejecutor reintenta | Esperar o cambiar de modelo. |
| «Rate limit … tokens per min» | Límite de OpenAI (200.000 tokens por minuto en tu organización) | Codex espera y reintenta. Tareas más pequeñas. |
| «apply deny-read ACLs» | Sandbox de Codex roto tras un apagón | `-c windows.sandbox=unelevated` en `executor.extraArgs`. |
| «Missing bearer…» (401) | La clave de OpenAI se guardó mal (un carácter) | Repetir el guardado comprobando la longitud. |
| Un orquestador no delega | Instrucciones antiguas o árbol sin confirmar | Reiniciar su sesión y comprobar `agentrelay doctor`. |
| LongCat repite el mismo mensaje | Bucle del modelo *preview* | Empezar una sesión nueva. |

## 9. Recomendación actual

- **Orquestador:** Claude para decidir y revisar; un modelo gratuito solo para tareas acotadas y siempre revisadas.
- **Ejecutor principal:** `codex` con `gpt-6-luna` a esfuerzo bajo, mientras dure el crédito de OpenAI.
- **Ejecutor gratuito de respaldo:** `opencode` con `nemotron-3-ultra-free`.
- **Antes de fiarse de un modelo nuevo:** pasarlo por la misma tarea de prueba y mirar el resultado, no el nombre.
