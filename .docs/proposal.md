# lut — Especificación técnica y plan de implementación

## Terminal multiplataforma orientada a proyectos, perfiles y agentes CLI

**Estado:** documento de referencia para iniciar el desarrollo con Codex / Claude Code  
**Versión del documento:** 1.2  
**Fecha:** 8 de noviembre de 2026  
**Idioma:** español  
**Nombre del producto:** **lut** (nombre definitivo).  
**Base tecnológica:** código fuente de [Terax](https://github.com/crynta/terax-ai) importado a este repositorio como punto de partida. **No es un fork mantenido:** lut es una bifurcación de desarrollo independiente, sin sincronización ni merges con upstream (ver ADR-001).  
**Commit de origen (importado y auditado):** [`a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9`](https://github.com/crynta/terax-ai/tree/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9).  
**Documentación del proyecto:** raíz única en `.docs/` (este archivo: `.docs/proposal.md`).  
**Tipo de auditoría disponible:** inspección estática selectiva de archivos y documentación del repositorio; **no** implica compilación, pruebas de ejecución, medición de rendimiento ni auditoría exhaustiva de dependencias.

> **Instrucción para el agente implementador:** este documento es el contrato de intención y de alcance del producto, no una descripción infalible del código actual. Antes de modificar nada, contrastar cada ruta, tipo, API y comportamiento contra el commit efectivamente elegido. Si una decisión entra en conflicto con una restricción demostrable de Terax, registrar el conflicto, proponer una adaptación mínima y mantener los invariantes del motor de terminal. No reescribir el renderer, el PTY ni la infraestructura de hooks sin justificación y pruebas.

---

## Identidad del producto (decisión cerrada)

| Campo                            | Definición                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Nombre de marca y producto**   | **lut**                                                                                                   |
| **Origen**                       | **lu** (Lucas) + **t** (terminal)                                                                         |
| **Escritura oficial**            | Siempre en minúsculas: `lut`; evitar `LUT`, `LuT`, `luT` como marca                                       |
| **Ejecutable principal deseado** | `lut`                                                                                                     |
| **Categoría**                    | Terminal desktop multiplataforma, orientada a proyectos, perfiles y agentes CLI                           |
| **Nombre de trabajo anterior**   | «Terminal Workspace» queda descartado; no utilizarlo en UI, documentación nueva ni identidad del producto |

**Implicaciones para implementación:** la aplicación final deberá mostrar `lut` en su título, About, accesos directos, instaladores, ejecutable y documentación. Los identificadores de paquete, bundle, repositorio, comandos auxiliares, rutas de configuración, URL de actualizaciones y eventual dominio se definirán en la Fase 0 con comprobaciones de disponibilidad y compatibilidad; **no inventarlos en este documento**.

El rebranding se divide en dos tareas con tiempos distintos:

1. **Aislamiento de identidad (Fase 0, inmediatamente después de validar el primer build del código importado):** bundle identifier, directorio de datos de la app, nombres de archivos persistidos (p. ej. `terax-spaces.json`), CLI auxiliar de hooks, marcadores de los hooks instalados en configuraciones de Claude/Codex, variables de entorno (p. ej. `TERAX_PANE_ID`), nombres de socket/puerto/pipe del control server y endpoint/clave del updater. Objetivo: que **lut nunca lea ni escriba datos, hooks ni configuración de una instalación de Terax** en la misma máquina. Como lut aún no tiene usuarios ni datos propios, este cambio no requiere migración; debe hacerse antes de cualquier uso real para que nunca la requiera.
2. **Rebranding visual (fases posteriores):** títulos, About, iconos, textos de UI y documentación.

No sustituir indiscriminadamente `terax` en código, protocolos y referencias históricas: renombrar cada identificador con intención, conservar los avisos legales y las atribuciones de terceros.

---

# 1. Resumen ejecutivo

Construir una aplicación **desktop multiplataforma y terminal-first** comparable a Windows Terminal en su función básica, pero superior en organización de trabajo, personalización e integración con agentes de desarrollo que **ya corren como procesos CLI**. No debe convertirse en un editor/IDE con una terminal subordinada, ni implementar otro chat de IA conectado a APIs pagas.

El producto debe permitir:

1. Ejecutar shells y herramientas habituales: PowerShell 7, Windows PowerShell, CMD, WSL, Bash, Zsh y otros compatibles con PTY.
2. Administrar **pestañas horizontales o verticales**, según preferencia del usuario, y paneles divididos (_splits_) dentro de cada pestaña.
3. Definir **perfiles de terminal**, al estilo Windows Terminal: shell, argumentos, directorio inicial, entorno, apariencia y comportamiento.
4. Definir **proyectos/workspaces persistentes**, capaces de restaurar disposición de ventanas, pestañas y splits, así como iniciar herramientas y comandos habituales. Al abrir lut se restaura la última sesión de proyectos, y en cualquier momento se pueden abrir otros proyectos guardados.
5. Ofrecer una **UI/UX radicalmente propia**, con temas, fuentes, colores, disposición, densidad, atajos y personalización.
6. Detectar e integrar **Claude Code, Codex y otros agentes CLI** mediante mecanismos públicos de hooks y señales de proceso, mostrando estado, finalización y necesidades de atención sin API keys propias.
7. Mantener funciones de exploración, Git, diff o edición como **utilidades secundarias, invocables bajo demanda** y no como elementos centrales o siempre visibles.
8. Mantener buen rendimiento, portabilidad, seguridad de ejecución de comandos y fiabilidad de aplicaciones TUI (Neovim, lazygit, etc.).

**Decisión arquitectónica:** partir del código fuente de Terax importado a este repositorio (sin dependencia de upstream) y practicar una **reconstrucción selectiva del shell visual** de la aplicación, conservando el core de terminal y los módulos que resulten reutilizables. No modificar componentes de alto riesgo únicamente para cambiar la apariencia visual.

**Objetivo de primera entrega:** Windows 11 funcional y sólido, con diseño y contratos multiplataforma desde el comienzo; luego validar Linux y macOS. Esto es una prioridad de pruebas, no autorización para codificar dependencias exclusivas de Windows.

---

# 2. Contexto, motivación y definición del producto

## 2.1. Necesidad concreta

El usuario utiliza terminales para múltiples proyectos, shells, herramientas de desarrollo y agentes. Cada vez que abre la terminal suele reconstruir manualmente el entorno de trabajo: abrir ventanas, moverse a directorios, crear pestañas/splits y lanzar programas. Quiere:

- Guardar ese entorno como un **proyecto reutilizable**.
- Que **al iniciar lut se restaure la última sesión**: los proyectos que estaban abiertos, el proyecto activo y su disposición de tabs/splits, aplicando las políticas de arranque de comandos (§8.4).
- **Abrir otros proyectos guardados** en cualquier momento, y tener varios abiertos a la vez.

**No se requiere** que lut arranque con el sistema operativo; la restauración ocurre al abrir la aplicación.

Las interfaces de terminal actuales resuelven bien la emulación, pero no necesariamente la gestión de este flujo. Windows Terminal ofrece splits y perfiles, pero no satisface la experiencia visual deseada ni la integración de agentes y workspaces planteada aquí.

Terax se aproxima técnicamente al objetivo, pero su experiencia visual enfatiza editor, Git y funciones de IA propia; sus pestañas se organizan principalmente en la parte superior. En este producto, **la terminal y la organización de terminales son la experiencia principal**.

## 2.2. Principios de producto

- **Terminal-first:** abrir la aplicación debe mostrar una terminal útil, no un editor, chat ni dashboard obligado.
- **No reinventar el terminal:** reutilizar emulación VT y renderizado existente de calidad.
- **IA consciente, no IA dependiente:** el host observa agentes oficiales, no reemplaza sus clientes ni sus contratos de suscripción.
- **Workspace-first:** guardar y restaurar contexto operativo, no solamente ubicaciones de carpetas.
- **Modularidad y discreción:** Git, explorador, editor o diff permanecen ocultos hasta que el usuario los necesite.
- **Personalización seria:** orientación de tabs, diseño, distribución, atajos, perfiles, tipografías, temas, indicadores.
- **No sorprender al usuario:** reiniciar herramientas, enviar comandos o instalar hooks requiere una configuración explícita y segura.
- **Privacidad local por defecto:** evitar enviar eventos de agentes o contenido de consola a servicios externos.
- **Manejo robusto de fallos:** los servicios UI/agent no deben impedir el uso de la terminal convencional.

## 2.3. Lo que no es este producto

- No es un clon de VS Code.
- No es un editor de código integrado como función principal.
- No es un agente de coding propio que consume claves de Anthropic/OpenAI.
- No debe intentar usar credenciales de una suscripción Claude/Codex para invocar APIs de modelos como si fueran claves.
- No requiere un backend remoto, una cuenta propia ni telemetría obligatoria.
- No implica reimplementar ANSI/VT, scrollback, selección, glyph atlas, ConPTY o GPU.
- No pretende que un proceso muerto sobreviva mágicamente al reinicio del sistema; **restaurar** significa recrear procesos/layouts, y **reanudar una conversación de agente** es una operación distinta.

---

# 3. Requisitos de producto

Usar identificadores estables para tareas, pruebas y trazabilidad. Las prioridades son **P0** (imprescindible para primer uso), **P1** (MVP ampliado), **P2** (posterior).

## 3.1. Terminal, sesiones y navegación

| ID      | Prioridad | Requisito                                | Criterio verificable                                                               |
| ------- | --------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| TER-001 | P0        | Crear sesión interactiva PTY             | Ejecuta `pwsh`, CMD y una shell WSL en Windows; entrada/salida interactiva         |
| TER-002 | P0        | Tabs múltiples                           | Crear, cerrar, renombrar, reordenar y cambiar tabs sin terminar las otras sesiones |
| TER-003 | P0        | Orientación horizontal/vertical de tabs  | Cambio en Settings en tiempo de ejecución, sin reiniciar procesos                  |
| TER-004 | P0        | Splits horizontales/verticales           | Dividir, enfocar, redimensionar y cerrar panes sin afectar otros                   |
| TER-005 | P0        | Sesiones ocultas activas                 | Un comando de larga duración continúa al cambiar de pestaña/proyecto               |
| TER-006 | P0        | Copiar, pegar, selección, búsqueda       | Funcionan en una terminal real y con Unicode                                       |
| TER-007 | P0        | Teclado y TUI fiables                    | Neovim, lazygit, Ctrl+C, flechas, teclado internacional, resize y mouse en TUI     |
| TER-008 | P1        | Atajos configurables                     | Acciones globales, navegación y split; evitar colisiones con shells                |
| TER-009 | P1        | Mover sesiones entre tabs                | Mover sin cerrar el PTY ni resetear su emulación                                   |
| TER-010 | P2        | Mover sesiones entre ventanas            | Sólo tras investigar propiedad de PTY, renderer y webviews                         |
| TER-011 | P1        | Cierre seguro                            | Avisar si hay procesos en ejecución cuando corresponda                             |
| TER-012 | P1        | Tabs con indicadores                     | Muestran opcionalmente estado agente, actividad, cwd y perfil                      |
| TER-013 | P1        | Tabs compactos, expandibles o con grupos | Preferencias visuales; ninguna afecta ciclo de vida del PTY                        |

## 3.2. Perfiles estilo Windows Terminal

**Qué se toma de Windows Terminal:** el concepto de perfil, es decir, poder abrir cada pestaña (o pane) con un shell distinto y que cada uno tenga su propio tema, carpeta de inicio, ícono, etc. **No** se busca compatibilidad con el formato de `settings.json` de Windows Terminal ni importar su configuración.

| ID      | Prioridad | Requisito                            | Criterio verificable                                                                                                                                      |
| ------- | --------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRO-001 | P0        | Perfiles nombrados                   | Crear, editar, duplicar, borrar, elegir por defecto                                                                                                       |
| PRO-011 | P0        | Abrir pestaña con un perfil          | El menú de nueva pestaña lista los perfiles; atajo para abrir el perfil por defecto y para elegir otro; pestañas distintas pueden usar perfiles distintos |
| PRO-012 | P0        | Ícono por perfil                     | Se muestra en la pestaña, en el menú de nueva pestaña y en el picker; admite íconos integrados y archivo de imagen                                        |
| PRO-013 | P1        | Título y color de pestaña por perfil | Título inicial (o el que fije el shell) y color de acento opcional en la pestaña                                                                          |
| PRO-002 | P0        | Shell/comando ejecutable por perfil  | Configurar ejecutable y argumentos sin depender de un `terminalShell` global                                                                              |
| PRO-003 | P0        | Directorio de inicio                 | Respetar cwd explícito o fallback configurable                                                                                                            |
| PRO-004 | P1        | Variables de entorno                 | Configurar mapa de variables con reglas de herencia claras                                                                                                |
| PRO-005 | P0        | Apariencia por perfil                | Fuente, tamaño, peso, colores, tema, cursor y scrollback; override sobre defaults                                                                         |
| PRO-006 | P1        | Entorno Windows/WSL/macOS/Linux      | El perfil puede definir destino y compatibilidad                                                                                                          |
| PRO-007 | P1        | Exportar/importar perfiles           | Esquema versionado, validación, merge sin duplicados                                                                                                      |
| PRO-009 | P1        | Perfil en cada pane                  | Diferentes panes del mismo proyecto pueden usar perfiles distintos                                                                                        |
| PRO-010 | P1        | Validación de perfiles               | Explicar ausencia de executable/entorno/workingDir, con opción de reparar                                                                                 |

Ejemplos de perfiles: PowerShell 7 normal; PowerShell sin perfil; Ubuntu WSL; CMD; Bash; shell para scripts; perfil de terminal de alto contraste; perfil con tema nocturno. **Perfiles no equivalen a agentes**: un perfil puede iniciar `pwsh`; un proyecto puede pedir al shell que ejecute `claude` cuando esté listo.

## 3.3. Proyectos y workspaces persistentes

| ID      | Prioridad | Requisito                                 | Criterio verificable                                                                                                                                                                                                                                                                                |
| ------- | --------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRJ-001 | P0        | Lista de proyectos                        | Crear, renombrar, duplicar, archivar/borrar                                                                                                                                                                                                                                                         |
| PRJ-002 | P0        | Guardar tabs y splits                     | Cerrar aplicación y restaurar árbol y tabs en siguiente inicio                                                                                                                                                                                                                                      |
| PRJ-003 | P0        | Directorio por pane                       | Mantener cwd específico, no solo raíz del proyecto                                                                                                                                                                                                                                                  |
| PRJ-004 | P0        | Relanzar comandos                         | Al restaurar, relanzar a pedido (P0) o con confirmación (P1) los comandos que seguían corriendo en cada pane                                                                                                                                                                                        |
| PRJ-005 | P0        | Distintos perfiles en un proyecto         | Por ejemplo PowerShell, WSL y shell de scripts                                                                                                                                                                                                                                                      |
| PRJ-006 | P1        | Ratios de splits                          | Guardar proporciones reales, no sólo la topología                                                                                                                                                                                                                                                   |
| PRJ-007 | P1        | Confirmación de relanzamiento             | Ejecutar / ejecutar siempre en este proyecto / no ejecutar, por comando                                                                                                                                                                                                                             |
| PRJ-008 | P1        | Estados de inicio por pane                | Pending, starting, ready, running, failed, exited                                                                                                                                                                                                                                                   |
| PRJ-009 | P1        | Reabrir proyecto existente                | Elegir enfocar instancia activa vs crear una segunda                                                                                                                                                                                                                                                |
| PRJ-010 | P1        | Reanudar agentes                          | Mecanismo específico y opcional según CLI, sin prometer persistencia de procesos                                                                                                                                                                                                                    |
| PRJ-011 | P1        | Varios proyectos activos                  | Cambiar entre ellos sin terminar sesiones existentes                                                                                                                                                                                                                                                |
| PRJ-012 | P2        | Ventanas múltiples por proyecto           | Guardar y restaurar geometría y asignación de tabs por ventana                                                                                                                                                                                                                                      |
| PRJ-013 | P1        | Estado vivo, sin presets                  | El proyecto es su último estado de sesión; no hay plantillas separadas                                                                                                                                                                                                                              |
| PRJ-014 | P1        | Migraciones de esquema                    | Actualizar formatos persistidos conservando datos y rollback                                                                                                                                                                                                                                        |
| PRJ-015 | P1        | Exportar/importar proyectos               | Formato portable, sin incluir secretos inadvertidamente                                                                                                                                                                                                                                             |
| PRJ-016 | P0        | Restaurar la última sesión al iniciar lut | Al abrir la app se reabren los proyectos que estaban abiertos al cerrar, con el proyecto activo y su layout; los comandos a relanzar piden confirmación (§8.4). Comportamiento configurable: restaurar última sesión (por defecto) / abrir un proyecto por defecto / iniciar con una terminal vacía |
| PRJ-017 | P0        | Abrir otros proyectos desde la app        | Desde el navegador de proyectos o la command palette, sin cerrar los ya abiertos (ver PRJ-011)                                                                                                                                                                                                      |

**Definición fundamental:** un _Project_ es el contexto de trabajo nombrado; su _estado guardado_ (tabs, splits, perfiles, cwd y comandos que seguían corriendo) es lo que se reconstruye; un _Running Workspace_ representa las sesiones activas. No hay presets: el proyecto es su estado vivo, que se guarda mientras se trabaja (decisión 26 de `.docs/plan/analysis/decisions.md`).

## 3.4. Interfaz y personalización

| ID     | Prioridad | Requisito                                                                             |
| ------ | --------- | ------------------------------------------------------------------------------------- |
| UX-001 | P0        | Terminal ocupa el área central y predominante                                         |
| UX-002 | P0        | Navegación de tabs vertical, horizontal, o auto si se agrega más adelante             |
| UX-003 | P0        | Sidebar de proyectos opcional, colapsable y con ancho persistido                      |
| UX-004 | P0        | Temas claros/oscuros y temas personalizados mediante tokens                           |
| UX-005 | P0        | Fuentes configurables y soporte de Nerd Fonts/powerline cuando el renderer lo permita |
| UX-006 | P1        | UI minimalista, densidad compacta/normal, iconografía coherente                       |
| UX-007 | P1        | Menús contextuales para tabs/panes/proyectos                                          |
| UX-008 | P1        | Command palette orientado a acciones de terminal/proyectos                            |
| UX-009 | P1        | Paneles secundarios opcionales: explorer, Git, diff, logs de agentes                  |
| UX-010 | P1        | Estados de carga/error/falta de permisos accesibles y no intrusivos                   |
| UX-011 | P1        | Layout compatible con DPI, tamaño mínimo, pantallas de alta densidad y teclado        |
| UX-012 | P2        | Interfaz visual de edición de layout y gestión de ventanas                            |

**Invariante de producto:** cambiar orientación de tabs o colapsar sidebar no debe desmontar componentes de sesión y provocar el cierre o respawn de un PTY.

## 3.5. Integración con agentes CLI

| ID      | Prioridad | Requisito                                                                                 |
| ------- | --------- | ----------------------------------------------------------------------------------------- |
| AGT-001 | P0        | Detectar Claude Code oficial que corre dentro de PTY propia                               |
| AGT-002 | P0        | Detectar Codex CLI oficial y sus eventos cuando la versión soporta hooks correspondientes |
| AGT-003 | P0        | No solicitar API key de Anthropic/OpenAI para monitorizar estos procesos                  |
| AGT-004 | P0        | Asociar agente con pane, PTY, tab, proyecto y sesión de agente                            |
| AGT-005 | P0        | Estado visible: iniciando, trabajando, atención, finalizado/error/salido                  |
| AGT-006 | P0        | Notificar finalización y requerimientos de atención con acción de enfoque                 |
| AGT-007 | P1        | Gestionar instalación de hooks con previsualización y desinstalación selectiva            |
| AGT-008 | P1        | No planificada (decisión 27): las CLIs de agentes ya muestran su actividad                |
| AGT-009 | P1        | Contexto de sesión y modelo/consumo donde exista fuente documentada de datos              |
| AGT-010 | P1        | Configurar tipos de notificación, sonidos y privacidad                                    |
| AGT-011 | P2        | Aprobar/rechazar permisos desde UI, sólo con protocolo seguro y fallback                  |
| AGT-012 | P1        | Normalizar eventos de múltiples CLI sin acoplar UI al JSON específico de cada una         |
| AGT-013 | P1        | Funcionar con CLI sin hooks usando señales no invasivas, sin inventar estados             |
| AGT-014 | P2        | Plugins/adaptadores de agentes adicionales                                                |

---

# 4. Decisiones de arquitectura (ADR)

## ADR-001: base técnica

**Elegido:** importar el código fuente de Terax (commit de origen fijado en la portada) a este repositorio y desarrollarlo aquí como producto independiente.  
**Descartado:** fork mantenido en GitHub con sincronización o merges desde upstream. lut cambia aproximadamente la mitad del producto (shell visual, navegación, proyectos, perfiles, retirada de la IA BYOK), así que mantener compatibilidad con upstream no tiene sentido.  
**Descartado para MVP:** construir motor PTY/VT/GPU desde cero.  
**Motivo:** Terax ya dispone de infraestructura multiplataforma de PTY, shell integration, Ghostty/WASM, renderizado WebGPU/WebGL, sesiones persistentes mientras están ocultas y bridge de hooks. Los costos técnicos y riesgos de volver a desarrollar esas piezas serían elevados.

**Condiciones:**

- Registrar el SHA de origen en el README y en `.docs/`, como trazabilidad de procedencia (no como vínculo de sincronización).
- Créditos a Terax en una nota (`NOTE`) del README, además de cumplir las obligaciones de licencia de §14.3.
- Crear un baseline reproducible del código importado antes de la primera refactorización.

## ADR-002: UI

**Elegido:** React + TypeScript bajo Tauri 2, manteniendo componentes base y renderer.  
**Descartado:** migración a iced/egui como primer paso.  
**Motivo:** la diferenciación está en composición de interfaces, navegación, personalización y flujo de trabajo. React/Tailwind/shadcn aceleran este desarrollo y permiten reutilizar la UI funcional ya existente.

## ADR-003: motor de terminal

**Elegido:** conservar `libghostty-vt`/WASM y el renderer que efectivamente exista en el commit fijado.  
**No hacer:** combinar xterm.js con `alacritty_terminal` o `portable-pty` sin un caso técnico explícito.  
**Detalle:** la versión analizada de Terax ya usa Ghostty/WASM con WebGPU y fallback WebGL, y Rust usa `portable-pty`. Una recomendación exploratoria anterior de `xterm.js` aplica a un Tauri nuevo, **no** al código de Terax importado.

## ADR-004: IA

**Elegido:** ejecutar CLI oficiales (`claude`, `codex`, etc.) utilizando la autenticación propia de cada herramienta; observar eventos por hooks.  
**No elegido:** IA integrada con proveedores BYOK como característica del producto.  
**Motivo:** los usuarios pueden tener suscripción de Claude Code/Codex proporcionada por empresa, sin acceso a claves de API. No se debe crear dependencia artificial de facturación por API.

## ADR-005: frontend

**Elegido:** **recrear UI/UX principal y conservar módulos funcionales de frontend**.  
**Conservar inicialmente:** `TerminalStack`, `TerminalPane`, `PaneTreeView`, Ghostty, contratos de sesión, helpers de splits, infraestructura de hooks y estado de agentes; adaptar temas y Spaces.  
**Recrear/refactorizar:** `App.tsx`, header, TabBar, navegación y modelo amplio de tabs.  
**No hacer:** borrar masivamente frontend para luego intentar reconstruir renderizador y protocolo sin necesidad.

## ADR-006: proyectos

**Elegido:** extender `Spaces` hacia proyectos que guardan su estado vivo y relanzan sus procesos, manteniendo migración de datos.  
**No elegido:** solamente almacenar una lista de directorios.  
**Motivo:** el valor es restaurar el entorno completo, incluido el arranque de herramientas.

## ADR-007: control de cambios

**Elegido:** migración incremental con pruebas entre fases y commits pequeños.  
**No elegido:** reescritura de una sola vez.  
**Motivo:** el renderer compartido, sesiones montadas persistentemente, el bridge de shell y los hooks tienen invariantes que podrían romperse con cambios aparentemente visuales.

## ADR-008: identidad del producto

**Elegido:** **lut**, siempre en minúsculas, ejecutable `lut`, derivado de «lu» (Lucas) + «t» (terminal).  
**No elegido:** «Terminal Workspace», `LuT` ni `LUT` como marca.  
**Motivo:** consistencia con la convención de productos personales `luX`, brevedad y claridad como comando.  
**Condición técnica:** el renombrado de IDs, rutas de datos, binarios auxiliares, configuración de hooks, variables de entorno, control server y updater (**aislamiento de identidad**) se hace en la Fase 0, inmediatamente después de validar el primer build, para que lut no comparta datos ni hooks con una instalación de Terax. El rebranding visual puede hacerse después. Ver «Identidad del producto».

---

# 5. Auditoría estática de Terax: evidencia, módulos y acoplamiento

## 5.1. Alcance de la inspección

Inspección de código público de Terax anclada al commit indicado. Se revisaron directamente, entre otros:

- `TERAX.md`, `CONTRIBUTING.md`, `docs/architecture/pty-shell-integration.md`, `docs/architecture/ai-subsystem.md`.
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `LICENSE`.
- `src/app/App.tsx`, `src/app/components/WorkspaceSurface.tsx`.
- `src/modules/terminal/TerminalStack.tsx`, `TerminalPane.tsx`, `PaneTreeView.tsx`, `lib/panes.ts`, `lib/terminalSessionApi.ts`, `ghostty/useGhosttyTerminalSession.ts`, `backend/selection.ts`.
- `src/modules/tabs/lib/useTabs.ts`, `src/modules/tabs/TabBar.tsx`, `src/modules/tabs/NewTabMenu.tsx`.
- `src/modules/spaces/lib/store.ts`, `useSpaces.ts`, `serialize.ts`, `useSpacePersistence.ts`, `useSpacesBoot.ts`, `SpaceSwitcher.tsx`.
- `src-tauri/src/lib.rs`, `src-tauri/src/modules/pty/mod.rs`, `pty/session.rs`, `agent.rs`, `agent_events.rs`.
- `src/modules/agents/store/agentStore.ts`, `model/types.ts`, `model/reducer.ts`, `lib/launcher.ts`, `components/AgentNotificationsBridge.tsx`, `components/NotificationBell.tsx`.
- `src/modules/control/lib/hooksConfig.ts`, `agentEvents.ts`, `useControlBridge.ts`.
- `src/modules/settings/store.ts`.

**No realizado:** clone completo en un entorno de build controlado, `pnpm install`, compilación Rust, test suite end-to-end, análisis automático exhaustivo de dependencias, comparación histórica de commits, benchmark o inspección de la versión binaria instalada por el usuario.

## 5.2. Versiones y dependencias observadas

En el `package.json` de la revisión inspeccionada:

- Terax declara **versión 0.9.0**.
- `React 19`, TypeScript, Vite, Tauri 2, Zustand, Tailwind 4, `react-resizable-panels`, shadcn/ui, Radix, Sonner.
- Administrador `pnpm` con versión fijada en `packageManager` y runtime Node >=22.
- Dependencia `@terax/ghostty-core` como paquete del workspace.
- También existen paquetes `@ai-sdk/*`, `ai`, CodeMirror y LSP propios de la IA/IDE integrado; deben revisarse antes de retirarlos.

En `src-tauri/Cargo.toml`:

- `tauri = "2"`, `portable-pty = "0.9"` en la revisión inspeccionada.
- Crates locales `terax-cli` y `terax-control-protocol`.
- Plugins Tauri de store, notificaciones, autoarranque, clipboard, updater y ventanas.

**Importante:** las versiones cambian. Validar nuevamente los manifests del código importado. Evitar actualización masiva de dependencias durante la extracción inicial.

## 5.3. Backend Rust: núcleo reutilizable

`src-tauri/src/lib.rs` registra estado y comandos Tauri para módulos entre los que figuran `pty`, `shell`, `workspace`, `control`, `agent`, `git`, `fs`, `lsp`, `net` y `secrets`.

En `src-tauri/src/modules/pty/mod.rs`:

- `PtyState` administra sesiones; `pty_open` acepta `cols`, `rows`, `cwd`, `workspace`, `blocks`, `shell`, `pane_id`, presentación y colores.
- `pty_write`, resize, close y controles del ciclo de vida administran la sesión.
- El PTY corre con I/O desacoplado del hilo de UI.
- Las sesiones tienen relación con un webview/owner y canales específicos de transporte.

En `pty/session.rs`:

- Se maneja el proceso shell, reader/writer, detección de agente y ciclo de vida.
- Existe cuidado especial de ConPTY y proceso descendiente en Windows.
- La implementación de shell integration emite OSC para cwd, prompt y límites de comandos.

**Conclusión:** no reescribir. Es base técnica de alto valor. Para nuevo producto, revisar nomenclatura, identificadores del bundle, rutas de perfil y variables de entorno sin alterar el protocolo de PTY.

## 5.4. Renderer Ghostty y geometría

La documentación actual describe:

- `libghostty-vt` como modelo terminal en WASM.
- WebGPU como renderer preferido, WebGL como fallback.
- Un canvas WebGPU compartido por ventana/área de terminal, con geometría de los paneles por viewport y scissor.
- Modelo persistente por leaf/pane y renderizadores que no necesitan duplicar el parser.
- Liberación y gestión cuidadosa de recursos gráficos y buffers.

`TerminalStack` contiene el elemento `[data-terminal-area]`, mantiene montadas las terminales vivas y esconde tabs inactivas mediante `visibility`/`pointerEvents`, **sin desmontarlas**. `PaneTreeView` utiliza el árbol de splits y `react-resizable-panels`; `TerminalPane` administra la sesión del pane.

**Invariantes críticos:**

1. No volver a montar un pane por cambiar la posición de la barra de tabs, expandir sidebar o cambiar de proyecto.
2. No crear un canvas nuevo por cada cambio visual de tab.
3. No acoplar layout de tabs a lifecycle de sesión.
4. Conservar el mecanismo de notificación/resize y sincronización entre modelo y PTY.
5. Evitar que los paneles ocultos sigan realizando trabajo visual innecesario.
6. Verificar cambios de DPI, resize continuo y compatibilidad TUI.
7. No modificar indiscriminadamente el WASM adaptado, atlas de fuentes o transporte de output.

`src/modules/tabs/lib/useTabs.ts` contiene `MAX_PANES_PER_TAB = 4`, explicado en el código como correlato del pool del renderer. **No** prometer un número arbitrario de panes sin rediseñar/probar esa restricción.

## 5.5. Frontend actual: separación parcial

- `src/app/App.tsx` tenía aproximadamente **1.696 líneas** en la revisión inspeccionada; coordina tabs, Spaces, sidebar, editor, Git, IA integrada, agentes, shortcuts, PTY, dialogs y otras vistas.
- `src/modules/tabs/lib/useTabs.ts` tenía aproximadamente **1.533 líneas**, con una unión `Tab` que incluye `TerminalTab`, `EditorTab`, `PreviewTab`, `MarkdownTab`, `AiDiffTab`, `GitDiffTab`, `GitHistoryTab`, `GitCommitFileDiffTab`.
- `WorkspaceSurface.tsx` alterna capas visibles para `TerminalStack`, `EditorStack`, `PreviewStack`, `MarkdownStack`, `AiDiffStack`, `GitDiffStack`, `GitHistoryStack`.
- `TerminalStack` recibe tabs y callbacks y no requiere que el editor esté montado para existir.
- `Header` coloca un `TabBar` de navegación horizontal.

**Interpretación:** los motores están modularizados, pero el coordinador de la aplicación y el tipo de tab agrupan funcionalidades de terminal e IDE. Para introducir una nueva navegación no basta cambiar CSS de `TabBar`.

## 5.6. Spaces: ya hay persistencia de parte del proyecto

`src/modules/spaces/lib/store.ts` define:

```ts
export type SpaceMeta = {
  id: string;
  name: string;
  root: string | null;
  env: WorkspaceEnv;
  color?: number;
  createdAt: number;
  updatedAt: number;
};

export type SpaceState = {
  tabs: SerializedTab[];
  activeTabIndex: number;
};
```

Persistido mediante `LazyStore` a `terax-spaces.json`. `serialize.ts` describe tabs de terminal, editor, preview y markdown, y cada terminal serializa un árbol de splits con orientación y `cwd` de hojas. `useSpacesBoot.ts` hidrata el estado. `useSpacePersistence.ts` salva con debounce de 3 segundos y al ocultar/cerrar la ventana.

**Lo que sí existe:** espacios con nombres, raíz, entorno local/WSL, tabs, splits, directorios por hoja, último tab activo.  
**Lo que falta en el esquema inspeccionado:** perfil por pane, ejecutable/argumentos propios, comandos de inicio, política de arranque, ratios exactos de splits, varias ventanas, semántica de plantilla frente a estado vivo y restauración explícita de una conversación Claude/Codex.

**Recomendación:** evolucionar y versionar este modelo. No desechar la serialización de splits ni la infraestructura de hidratación.

## 5.7. Perfiles: estado actual

`src/modules/settings/store.ts` contiene preferencias globales como `terminalShell`, fuente, peso, tamaño, espaciado, scrollback, cursor, renderer y valores de tema. `useGhosttyTerminalSession.ts` lee `preferences.terminalShell` al abrir el PTY.

Por su parte, `pty_open` acepta un `shell` individual. Esa interfaz ayuda a implementar perfiles por pane, pero probablemente haya que ampliar el contrato para **argumentos, entorno, políticas de inicio y datos de perfil** sin inyectarlos de manera insegura.

No se encontró en los archivos revisados un modelo completo de perfiles nombrados equivalente a Windows Terminal. **Esto no prueba la inexistencia absoluta de toda funcionalidad similar en otros archivos o versiones**, pero justifica diseñar un módulo de perfiles propio.

## 5.8. Agentes CLI frente a IA integrada: distinción obligatoria

Terax mantiene **dos conjuntos de capacidades distintos**:

**IA integrada / BYOK**, principalmente `src/modules/ai/`, `net`, `secrets`, algunos componentes de editor, tools y chat: permite utilizar proveedores de modelos mediante claves propias o ciertos backends locales. **No es parte central del producto deseado.**

**Agentes CLI externos**, principalmente `src/modules/agents/`, `src/modules/control/`, Rust `agent.rs`, `agent_events.rs`, `pty/agent_detect.rs` y crates `terax-cli`/`terax-control-protocol`: identifica procesos como Claude Code/Codex que ya corren en terminal y recibe eventos estructurados. **Debe conservarse y ampliarse**.

El archivo `agentStore.ts` tiene un campo `localAgent` junto con sesiones y notificaciones; por lo tanto, **no es 100 % exclusivo de agentes externos**. Separar con cuidado lo compartido.

## 5.9. Evidencia de hooks y eventos

En `src-tauri/src/modules/agent.rs`, la tabla de agentes contempla:

- **Claude:** `SessionStart`, `UserPromptSubmit`, `PermissionRequest`, `Notification`, `Stop`, `SessionEnd`; soporte declarado pero varios hooks de herramientas, fallos y subagentes desactivados por defecto en el instalador de la revisión.
- **Codex:** `SessionStart`, `UserPromptSubmit`, `PermissionRequest`, `Stop`, con `PreToolUse`/`PostToolUse` presentes pero desactivados en esa tabla.
- **Gemini:** eventos de inicio, herramienta, notificación y fin; algunos desactivados.
- **Pi:** extensión gestionada por Terax.

Los eventos entregados por hooks se normalizan a un modelo local de agente. La integración utiliza un CLI auxiliar, variables de entorno como `TERAX_PANE_ID`, y un servidor de control local. `agent_events.rs` administra validación, correlación y un broker de decisiones; los hooks de permisos pueden esperar una respuesta UI cuando hay un consumidor válido y volver al prompt original cuando no lo hay.

**No confundir:** que el código contenga adaptadores no garantiza que la versión de Claude/Codex instalada soporte todos esos eventos ni que cada integración esté activa. El agente implementador debe verificar compatibilidad oficial en tiempo de desarrollo.

En `src/modules/agents/model/types.ts` existe un modelo más completo con estados:

```ts
"starting" | "working" | "needs-input" | "needs-approval" |
"done" | "error" | "idle" | "exited"
```

Incluye `AgentHookEvent` con `paneId`, `ptyId`, `agent`, `kind`, `sessionId`, `transcriptPath`, `cwd`, `message`, `tool`, `permission` y `subagent` (campos opcionales según evento). El reducer del modelo ya está desarrollado; la documentación interna indica que aún no está conectado a la UI completa.

`AgentNotificationsBridge.tsx` consume principalmente señales simplificadas, en lugar de explotar todo el modelo detallado. **Oportunidad:** conectar el reducer y alimentar nuevos badges y vista de actividad desde un store normalizado.

## 5.10. Evaluación cualitativa de acoplamiento

| Área                           | Riesgo de extracción                     | Acción propuesta                         | Observación                                   |
| ------------------------------ | ---------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| PTY Rust y shell integration   | Bajo/medio                               | Conservar                                | Mantener comandos/protocolo                   |
| Ghostty/WASM y GPU             | Medio/alto riesgo de modificación        | Conservar sin grandes cambios            | Mucha optimización e invariantes              |
| `TerminalStack`/`TerminalPane` | Medio                                    | Conservar y adaptar contratos mínimos    | No desmontar tabs ocultas                     |
| Helpers `panes.ts`             | Bajo                                     | Reutilizar                               | Árbol y operaciones puras                     |
| `Spaces` + serialización       | Medio                                    | Extender con migraciones                 | Base útil para proyectos                      |
| `useTabs.ts`                   | Alto                                     | Dividir en modelo de sesión y navegación | Unión de tabs de IDE                          |
| `App.tsx`                      | Alto                                     | Reescribir como coordinador pequeño      | Altas interdependencias                       |
| Header/TabBar/Sidebar          | Alto como UX; bajo valor de conservación | Recrear                                  | Producto exige otra navegación                |
| Tema/preferencias              | Medio                                    | Reutilizar tokens, separar preferencias  | Mezcla ajustes de IDE/AI                      |
| CLI/hooks agentes              | Medio                                    | Conservar, adaptar marca/protocolo       | Dependencias con `control` y PTY              |
| IA integrada (BYOK)            | Alto en raíz/UI                          | Desacoplar/retirar                       | No eliminar dependencias necesarias para CLI  |
| Editor/Git/explorer            | Medio                                    | Opcional y lazy                          | Quitar del inicio, no del código sin análisis |
| Multiwindow                    | Alto                                     | Fase posterior                           | PTY/webview/renderer por ventana              |

Las etiquetas son una **estimación estática**. Se deben validar con `cargo check`, TypeScript y pruebas específicas luego de cada extracción.

---

# 6. Arquitectura objetivo

## 6.1. Capas

```text
┌───────────────────────────────────────────────────────────────┐
│ Aplicación Tauri desktop                                     │
│                                                               │
│  FRONTEND React/TypeScript                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ AppShell / Theme / Keymap / CommandPalette              │  │
│  │   ├─ ProjectNavigator                                   │  │
│  │   ├─ TabNavigator (horizontal | vertical)               │  │
│  │   ├─ WorkspaceView                                      │  │
│  │   │   └─ TerminalStack (reutilizado)                     │  │
│  │   │       ├─ PaneTreeView                               │  │
│  │   │       ├─ TerminalPane                               │  │
│  │   │       └─ Ghostty WASM + GPU renderer                 │  │
│  │   ├─ AgentStatus / AgentActivity / Notifications        │  │
│  │   └─ OptionalTools (Editor / Git / Explorer, lazy)       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                      │ Tauri IPC / PTY stream                │
│  RUST BACKEND        ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ PTY Manager + portable-pty / ConPTY / Unix PTY          │  │
│  │ Shell Integration + Session Registry                    │  │
│  │ Control Server + Agent Hooks + Hook Broker              │  │
│  │ Project/Profile Persistence + Launcher                  │  │
│  │ Notifications + OS Integration                          │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                │                           │
                ▼                           ▼
    pwsh/cmd/WSL/bash/zsh          Claude Code / Codex CLI
                                   (autenticación propia)
```

## 6.2. Separación entre dominios

Se recomienda diferenciar los siguientes dominios lógicos:

- `terminal-core`: motor y renderizado, adaptadores PTY/VT.
- `sessions`: lifecycle de PTY, mapeo `leafId ↔ ptyId`, operaciones sobre sesiones y resize.
- `navigation`: tabs, orientación, selección, orden y grupos. **No** crea el PTY por sí mismo.
- `layouts`: árboles de split y ratios; operaciones puras con identificadores estables.
- `profiles`: configuración y validación de procesos/estilo de sesión.
- `projects`: metadatos, estado guardado, lifecycle de restauración y relanzamiento de comandos.
- `agents`: eventos normalizados, estados, plugins/adaptadores, notificaciones.
- `optional-tools`: editor, Git, explorer, diff como capabilities con carga bajo demanda.
- `settings`: preferencias globales y overrides por perfil/proyecto.
- `platform`: Windows/WSL/macOS/Linux, rutas, ventanas, permisos y menú nativo.

**Regla:** la UI observa servicios y emite intenciones; las acciones sobre procesos y archivos pertenecen al backend/controlador. Los módulos pueden compartir tipos y eventos, pero evitar importaciones circulares de componentes.

## 6.3. Frontend de referencia (organización conceptual)

```text
src/
├── app/
│   ├── App.tsx                     # Composición, providers y arranque
│   ├── AppShell.tsx                # Estructura terminal-first
│   └── providers/
├── features/
│   ├── navigation/
│   │   ├── TabNavigator.tsx
│   │   ├── VerticalTabs.tsx
│   │   ├── HorizontalTabs.tsx
│   │   └── navigationStore.ts
│   ├── projects/
│   │   ├── ProjectNavigator.tsx
│   │   ├── ProjectEditor.tsx
│   │   ├── projectStore.ts
│   │   └── projectSchema.ts
│   ├── profiles/
│   │   ├── ProfilePicker.tsx
│   │   ├── ProfileEditor.tsx
│   │   └── profileSchema.ts
│   ├── agents/
│   │   ├── AgentBadge.tsx
│   │   ├── AgentActivityPanel.tsx
│   │   ├── AgentNotifications.tsx
│   │   └── agentViewSelectors.ts
│   ├── appearance/
│   └── optional-tools/
├── modules/terminal/             # REUTILIZAR base Terax
├── modules/control/              # REUTILIZAR/adaptar
├── modules/agents/               # REUTILIZAR/adaptar
├── modules/spaces/               # MIGRAR de forma controlada
└── shared/
    ├── types/
    ├── events/
    └── ui/
```

La estructura es orientativa. No reorganizar archivos del renderer sólo por estética de carpetas. Conservar rutas originales de Terax hasta que la compilación y las pruebas permitan una migración sin riesgo.

## 6.4. Invariante de identidad

Cada entidad debe tener identificadores estables, separados:

- `projectId`: proyecto lógico persistido.
- `windowId`: ventana desktop.
- `tabId`: agrupación visual de panes.
- `paneId`/`leafId`: posición/identidad funcional de panel (confirmar su semántica real en Terax).
- `ptyId`: sesión PTY real.
- `agentSessionId`: conversación/sesión del CLI, no necesariamente igual a `ptyId`.

**No usar cwd o nombre de tab como clave de correlación:** dos agentes pueden correr simultáneamente en el mismo directorio. Un mismo proceso puede cambiar de cwd. Un proyecto puede tener múltiples instancias.

## 6.5. Reglas de estado y persistencia

- El PTY es recurso vivo y no debe almacenarse en JSON.
- El proyecto se guarda como su **estado vivo**; no hay plantillas declarativas (presets).
- Un snapshot captura estructura visual y configuración de reinicio.
- Un comando a relanzar se guarda como texto mientras sigue corriendo, nunca como estado del proceso, y se borra cuando termina.
- Las migraciones de esquema requieren `schemaVersion` y transformaciones probadas.
- Los IDs de recursos de runtime deben regenerarse y reconciliarse durante hidratación.
- El cierre de proyecto activo debe definir política: cerrar PTY, suspender presentación o mantener recursos en memoria.
- Un reinicio de aplicación recrea shells, pero no preserva memoria de procesos ni estado interactivo salvo soporte del programa en cuestión.

---

# 7. Diseño de perfiles

## 7.1. Modelo de datos propuesto

**Esquema ilustrativo** (la sintaxis final debe ser validada por Zod en TS y Serde en Rust cuando cruce IPC):

```ts
type TerminalProfile = {
  schemaVersion: 1;
  id: string;
  name: string;
  platform?: "any" | "windows" | "linux" | "macos";
  environment?:
    | { kind: "native" }
    | { kind: "wsl"; distro?: string };
  executable: string;            // p.ej. pwsh.exe o bash
  args: string[];                // array, no string de shell
  cwd?: string;
  env?: Record<string, string>;
  icon?: string;                 // id de ícono integrado o ruta a imagen
  tab?: {
    title?: string;              // título inicial; el shell puede cambiarlo si se permite
    allowShellTitle?: boolean;
    color?: string;              // color de acento de la pestaña
  };
  appearance?: {
    themeId?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    cursorStyle?: "bar" | "block" | "underline";
    scrollback?: number;
    opacity?: number;
  };
  closeBehavior?: "ask" | "close" | "keep-open-after-exit";
};
```

Los overrides deben resolverse mediante capas:

`globalDefaults` → `terminalProfile` → `projectPaneOverrides` → `runtimeTransientOverrides`.

Definir con tests qué propiedades se fusionan (por ejemplo env) y cuáles se reemplazan completas (por ejemplo `args`). Los secretos no deben exportarse automáticamente en proyectos compartidos.

## 7.2. Ejemplos de perfiles

```json
{
  "schemaVersion": 1,
  "id": "pwsh7",
  "name": "PowerShell 7",
  "platform": "windows",
  "environment": { "kind": "native" },
  "executable": "pwsh.exe",
  "args": [],
  "appearance": { "fontFamily": "CaskaydiaCove Nerd Font", "fontSize": 13 }
}
```

```json
{
  "schemaVersion": 1,
  "id": "ubuntu-wsl",
  "name": "Ubuntu WSL",
  "platform": "windows",
  "environment": { "kind": "wsl", "distro": "Ubuntu-24.04" },
  "executable": "bash",
  "args": ["-l"]
}
```

**Precaución:** el ejemplo WSL expresa el objetivo de dominio, no necesariamente el formato exacto que `pty_open` entiende en el commit de Terax. La implementación debe resolver y traducir perfiles a la API backend existente.

## 7.3. Integración con shell existente

En Windows conservar cuidadosamente scripts de PowerShell y el sourcing de perfil de usuario. La función personalizada `prompt`, OSC 7/133, el procesamiento de rutas con backslashes, política `-NoProfile` cuando se configura y compatibilidad ConPTY deben verificarse con tests. No reemplazar el startup de shells por comandos concatenados arbitrariamente en una línea sin estrategia de quoting/ready state.

---

# 8. Diseño de proyectos: estado guardado, restauración y relanzamiento

## 8.1. Semántica: proyecto, estado guardado y sesión

**Project:** entidad estable: `id`, nombre, repositorio/directorio base, metadatos, color, entornos autorizados y una
carpeta fija opcional (`pinnedFolder`). Las herramientas (archivos, Git, editor, LSP) usan esa carpeta si está fijada;
si no, la ubicación del pane de terminal con foco (o el último que lo tuvo), en su propio sistema de archivos. El entorno
(Windows o una distro WSL) lo da el perfil de cada pane, no el proyecto (decisión 29).  
**Estado guardado:** ventanas/tabs/splits con ratios y, por pane, perfil, cwd y el comando que seguía corriendo; se guarda
solo mientras se trabaja (no hay presets ni editor de presets).  
**Running Workspace:** instancia con sesiones reales, estado de ejecución y errores.

Un proyecto puede ofrecer: “Abrir proyecto”, “Abrir como nueva instancia” y “Cerrar sesiones del proyecto”. Evitar
duplicar procesos accidentalmente si ya está abierto.

## 8.2. Modelo propuesto del estado guardado

```ts
type PaneState = {
  id: string;                     // ID estable del pane guardado, no ptyId
  profileId: string;
  cwd?: string;
  runningCommand?: string;        // comando que seguía corriendo al guardar, tal como se escribió
  resume?: {
    tool: "claude" | "codex" | "other";
    mode: "none" | "continue" | "specific-session";
    sessionId?: string;
  };
};

type LayoutNode =
  | { kind: "pane"; paneId: string }
  | {
      kind: "split";
      direction: "horizontal" | "vertical";
      children: LayoutNode[];
      ratios?: number[];         // normalizar: suma 1; misma cantidad que hijos
    };

type TabState = {
  id: string;
  title?: string;
  root: LayoutNode;
};

type WindowState = {
  id: string;
  title?: string;
  bounds?: { x?: number; y?: number; width: number; height: number };
  tabs: TabState[];
  activeTabId?: string;
};

type ProjectState = {
  schemaVersion: 2;               // v1: Spaces migrados (layout y cwd); v2 agrega runningCommand y relaunchApprovals
  projectId: string;
  windows: WindowState[];
  panes: Record<string, PaneState>;
  // "Ejecutar siempre en este proyecto": cada aprobación vale para ese comando, cwd y perfil.
  relaunchApprovals: { command: string; cwd?: string; profileId: string }[];
};
```

**MVP:** mantener `windows` preparado en el esquema aunque sólo se implemente una ventana, o aceptar temporalmente un solo `WindowState` con migración explícita posterior. Evitar agregar una UI multiwindow sin resolver antes el modelo de ownership del PTY y canvas.

## 8.3. Ejemplo de proyecto “Reforge”

Concepto (nombres de rutas y comandos ficticios, adaptar a cada máquina):

```yaml
project:
  id: reforge
  name: Reforge
  root: 'D:\dev\ayi\reforge'
  state: # guardado mientras se trabaja
    window: main
    tabs:
      - title: Desarrollo
        split: horizontal
        panes:
          - profile: pwsh7
            cwd: 'D:\dev\ayi\reforge' # el último comando ya terminó: no se relanza nada
          - profile: pwsh7
            cwd: 'D:\dev\ayi\reforge'
            runningCommand: 'pnpm dev'
      - title: Agents
        split: vertical
        panes:
          - profile: pwsh7
            runningCommand: 'claude'
          - profile: pwsh7
            runningCommand: 'codex'
  relaunchApprovals:
    - { command: 'pnpm dev', cwd: 'D:\dev\ayi\reforge', profile: pwsh7 }
```

Este YAML es sólo un ejemplo legible. La implementación puede persistir en JSON mediante Tauri Store, con esquema versionado.

## 8.4. Restauración segura: algoritmo propuesto

1. Cargar metadatos y estado guardado del proyecto, validar `schemaVersion` y existencia de perfiles.
2. Resolver disponibilidad de entornos (WSL distro, cwd, ejecutables) y mostrar correcciones si faltan.
3. Resolver si hay una instancia viva: enfocar, crear otra o cancelar.
4. Crear **estructura visual** con IDs guardados y de runtime separados, sin ejecutar todavía comandos.
5. Crear sesiones PTY, respetando límites del renderer y carga progresiva. Conservar sesión oculta si está activa.
6. Esperar evento de sesión lista / prompt reconocido; no usar un simple `sleep(500)` como contrato de shell-ready.
7. Aplicar overrides del perfil y cwd de pane antes de ejecutar startup.
8. Para cada pane con comando a relanzar: si no está aprobado en el proyecto, preguntar “Ejecutar”, “Ejecutar siempre en este proyecto” o “No ejecutar”; evitar doble ejecución.
9. Registrar resultado por pane, errores y acciones “Reintentar” y “Abrir shell sin ejecutar comando”.
10. Sólo después de hidratar correctamente, habilitar la persistencia automática para evitar sobreescribir datos guardados con un estado parcial.

## 8.5. Riesgos del autoarranque

Nunca relanzar sin confirmación un comando que no fue aprobado en este proyecto, incluido un proyecto importado de otro equipo o descargado de Internet (las aprobaciones no se exportan). Comandos como `git reset --hard`, `rm`, `del`, despliegues, scripts de infraestructura o `npm run ...` pueden tener efectos secundarios. Ofrecer:

- Permiso por proyecto y comando (“Ejecutar siempre en este proyecto”).
- Modal de previsualización de los comandos a relanzar.
- Indicadores de contexto: directorio, shell/WSL y variables relevantes.
- Detección de perfil inaccesible y comandos fallidos.
- Posibilidad de desactivar autoarranque globalmente.
- Prohibición de ejecutar comandos automáticamente al **simplemente previsualizar** un proyecto.

## 8.6. Reanudar Claude/Codex

No confundir “abrir `claude` en una nueva PTY” con “restaurar el proceso anterior”. Para Claude se pueden evaluar opciones oficiales como `--continue`, `--resume` o sesión específica según versión. Para Codex, validar en la versión instalada sus flags oficiales de resume. Estos comandos deben configurarse mediante adaptadores y pasar por las mismas políticas de arranque.

**No asumir compatibilidad uniforme entre CLIs.** Si falla una reanudación, ofrecer shell normal e informar el fallo sin invalidar el proyecto.

---

# 9. Integración con agentes: diseño detallado

## 9.1. Regla de autenticación

La app **lanza el binario oficial** y el proceso usa su propio login, token, configuración corporativa o suscripción según políticas del proveedor. La aplicación **no lee, exporta ni simula las credenciales** de Claude Code/Codex y no necesita configurar un proveedor BYOK para recibir hooks.

## 9.2. Flujo de evento

```text
Claude Code / Codex CLI dentro del shell
       │
       │ hook oficial (JSON por stdin)
       ▼
CLI Bridge / comando auxiliar instalado con consentimiento
       │ metadatos de panel + endpoint local
       ▼
Backend Rust: control server + autenticación + normalización
       │
       ├─ correlación: paneId, ptyId, agent sessionId, projectId
       ├─ deduplicación, límites de tamaño/frecuencia, estados
       └─ optional decision broker (aprobaciones futuras)
       │
       ▼
Frontend event adapter / state reducer
       │
       ├─ badges de tabs
       ├─ notificaciones y foco
       ├─ panel de actividad opcional
       └─ timeline/reporte local opcional
```

Usar el bridge de Terax como base, adaptando nombres/identificadores a la nueva aplicación cuando corresponda. **No abrir sin autenticación un endpoint HTTP accesible desde la red** para recibir hooks. Si se usa loopback, implementar autenticación local y verificar ownership del pane.

## 9.3. Estados normalizados

```ts
type AgentStatus =
  | "starting"
  | "working"
  | "needs-input"
  | "needs-approval"
  | "done"
  | "error"
  | "idle"
  | "exited";
```

Estados no deben basarse exclusivamente en intervalos de silencio del terminal. Preferir hooks estructurados; usar señales de proceso/OSC como fallback con indicador de confianza/fuente. No interpretar ANSI crudo mediante regex para decidir si un agente pidió aprobación.

Para `Stop`: puede significar fin de una respuesta, no fin del proceso/sesión. Un CLI puede quedar esperando un nuevo prompt dentro de la misma PTY. Mostrar “respuesta finalizada” y reservar `exited` para salida real.

## 9.4. Eventos Claude Code y posibles UX

| Origen/evento                    | Acción de producto                             | Restricción                                             |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `SessionStart`                   | Registrar sesión y mostrar agente activo       | Correlacionar con pane/PTY                              |
| `UserPromptSubmit`               | Cambiar a `working`, registrar inicio de turno | No guardar prompt íntegro por defecto                   |
| `PermissionRequest`              | Badge `needs-approval`, notificación con foco  | No autoaprobar                                          |
| `Notification`                   | Notificación de atención o información         | Deduplicación/filtros                                   |
| `Stop`                           | Marcar respuesta terminada                     | No confundir con cierre proceso                         |
| `SessionEnd`                     | Finalizar sesión de agente                     | Diferenciar de cierre PTY                               |
| `PreToolUse` / `PostToolUse`     | Timeline y herramienta actual                  | Activar sólo cuando haya consumidor; impacto/privacidad |
| `PostToolUseFailure`             | Error de herramienta                           | Puede depender de versión                               |
| `SubagentStart` / `SubagentStop` | Subagentes activos y terminados                | Puede depender de versión                               |
| `PreCompact` / eventos de modelo | Métricas/indicadores si disponibles            | Confirmar esquema oficial actual                        |

**Fuente de compatibilidad:** verificar documentación oficial de hooks de la versión instalada en el momento de implementar: https://code.claude.com/docs/en/hooks. No instalar eventos hipotéticos ni basar contratos estables en campos no documentados.

## 9.5. Codex y otros agentes

Diseñar `AgentAdapter` independiente de la UI:

```ts
type NormalizedAgentEvent = {
  source: "claude" | "codex" | "gemini" | "pi" | "other";
  paneId: number;
  ptyId: number;
  agentSessionId?: string;
  timestamp: number;
  type:
    | "started" | "working" | "attention" | "permission"
    | "tool-start" | "tool-end" | "subagent-start" | "subagent-stop"
    | "response-done" | "error" | "exited";
  provenance: "hook" | "osc" | "process";
  metadata?: Record<string, unknown>;
};
```

La implementación real puede reutilizar `AgentHookEvent` y el reducer existentes, minimizando transformaciones. La clave es que la UI **no importe tipos de eventos nativos específicos del proveedor** para decidir su renderizado.

Las capacidades oficiales de Codex cambian por versión. Confirmar cuáles hooks existen y su semántica antes de activar integración y aprobación; conservar fallback si un hook no existe.

## 9.6. UX sugerida de agentes

**Minimal, terminal-first:**

- Tab muestra icono de CLI conocido y badge discreto de estado.
- Si `needs-approval`: cambiar badge, destacar tab y permitir atajo “Ir al próximo agente que requiere atención”.
- Si `response-done`: badge y notificación configurable; no sustituir output del CLI.
- Vista `Agent Activity` **colapsada por defecto**, accesible mediante atajo o menú de tab. **No planificada** (decisión 27).
- Panel de proyecto opcional con todas las sesiones activas, estado y conteo de subagentes.
- Historial corto de eventos locales, con política explícita de retención.
- Notificaciones nativas sólo en casos relevantes; evitar spam por cada herramienta o token.

## 9.7. Métricas de uso, modelo y contexto

Claude Code ofrece mecanismos como `statusLine`, distintos de los hooks. Se puede explorar un bridge opcional para obtener contexto, modelo, duración y ciertos datos de uso si la versión activa los ofrece. **No asumir que todas las cuotas o ventanas de uso están disponibles en todos los planes/versiones.**

**Riesgo de convivencia:** Claude Code suele admitir configuración de statusLine gestionada por usuario; no reemplazar el comando existente de manera silenciosa. Diseñar modo explícito de integración/encadenamiento o renunciar a ciertas métricas cuando no se pueda coexistir de forma segura.

**Privacidad:** datos como prompts, transcripciones, rutas, herramientas y comandos pueden ser sensibles. Redactar/suprimir por defecto. Métricas de consumo no deben interpretarse como costos adicionales a una suscripción.

## 9.8. Aprobaciones desde UI: fase avanzada

El código Terax tiene un broker de decisiones, pero habilitar aprobaciones externas en la UI exige garantías:

1. Se muestra acción concreta, comando y contexto completo (cuando sea seguro), nunca un botón ambiguo.
2. Se verifica relación exacta con sesión, pane, PTY y ventana.
3. La respuesta sólo afecta la solicitud vigente; nonce/ID y timeout impiden aprobar una solicitud distinta.
4. Si UI no está disponible o vence el plazo, **fallback al flujo normal del agente**, sin aprobación silenciosa.
5. Nunca almacenar un estado “always allow” sin una política explícita y segura.
6. Registrar auditoría local de aprobación/rechazo de forma acotada.
7. Confirmar las garantías de autorización ofrecidas por cada CLI; no falsificar respuestas.

**Fuera del MVP inicial.** Primero notificar y enfocar el pane original.

## 9.9. Eliminación del agente IA propio sin romper CLI

- Localizar `AiComposerProvider`, `useAiBootstrap`, `useChatStore`, `AiMiniWindow`, `AgentRunBridge`, herramientas AI, modelos y llaves de proveedor.
- No eliminar indiscriminadamente `src/modules/agents`, `src/modules/control`, `src-tauri/src/modules/agent.rs`, `agent_events.rs`, ni crates de protocolo.
- `agentStore.ts` tiene estado para agente local y agentes CLI: refactorizarlo antes de eliminar su dependencia.
- `spaces/useSpacesBoot.ts` importa `native` desde un módulo `ai`; mover wrappers compartidos Tauri a capa `platform` o `native` neutral.
- `App.tsx` monta `AiComposerProvider` en la raíz; debe reemplazarse por providers verdaderamente necesarios.
- Actualizar `package.json` y `Cargo.toml` sólo después de construir grafo de imports y comprobar impacto.

---

# 10. Reemplazo del shell visual y separación del frontend

## 10.1. No hacer una reescritura del motor de terminal

**Conservar al principio, casi sin cambios:**

- `src/modules/terminal/TerminalStack.tsx`.
- `src/modules/terminal/TerminalPane.tsx`.
- `src/modules/terminal/PaneTreeView.tsx`.
- `src/modules/terminal/ghostty/` y backend GPU.
- `src/modules/terminal/lib/panes.ts`.
- `src/modules/terminal/lib/terminalSessionApi.ts`.
- `src-tauri/src/modules/pty/` y transporte PTY.

La integración del shell nuevo debe respetar props, callbacks, identidad y duración de `TerminalStack`. Si el árbol de React cambia de raíz por modificar un tema o tab, comprobar si React remonta instancias.

## 10.2. Componentes a reemplazar

- `src/app/App.tsx`: sustituir responsabilidades monolíticas por `AppShell` + servicios + hooks especializados.
- `src/modules/header/Header.tsx`: nueva barra de título, herramientas y contexto.
- `src/modules/tabs/TabBar.tsx`: navegador orientable vertical/horizontal.
- `src/modules/tabs/NewTabMenu.tsx`: catálogo de perfiles, no lista central de herramientas IDE.
- `src/app/components/WorkspaceSurface.tsx`: adaptar para que terminal sea superficie por defecto y tools secundarias sean lazy; no es obligatorio borrar inmediatamente el componente.
- Sidebar actual: nueva navegación de proyectos, sin explorer/source control permanente.

## 10.3. Estrategia de tabs

No eliminar del primer commit la unión amplia `Tab`, porque otros módulos, serialización y cleanup dependen de ella. Hacerlo en pasos:

1. Crear interfaz visual `TabNavigator` que reciba un contrato mínimo: id, title, icon, state, active, close, reorder, focus, orientation.
2. Adaptar `useTabs` al contrato con selector `terminalTabs`; mantener el resto oculto.
3. Extraer operaciones puras de navegación y lifecycle de terminal.
4. Introducir capacidades opcionales `ContentTab` o `ToolWindow` para editor/diff/preview.
5. Migrar serialización y consumidores; recién entonces eliminar variantes innecesarias.
6. Tests de cierre, focus, reordenado, cold tabs y sesiones vivas.

**No usar un ID de `tab` como única clave de sesión:** un tab contiene varios leaf/panes.

## 10.4. Tabs verticales y horizontales

Diseñar un único estado de navegación y dos presentaciones. No mantener dos stores paralelos. Cambio de orientación debe conservar:

- Orden.
- Estado activo.
- Cierre/reapertura.
- Identidad de tab/pane.
- Indicadores de agente.
- Scroll de lista y accesibilidad.
- Sesiones montadas.

El sidebar de proyectos y el navegador de tabs **son componentes distintos**, aunque puedan compartir una columna izquierda. Soportar combinaciones: proyectos ocultos/tabs verticales; proyectos visibles/tabs horizontales; ambas navegaciones visibles; modo foco.

## 10.5. Layout visual conceptual

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Barra compacta: proyecto activo | acciones | buscar | perfil         │
├──────────────┬────────────────┬──────────────────────────────────────┤
│ Proyectos    │ Tabs verticales│ Terminal / splits                    │
│ (opcional)   │ (configurable) │                                      │
│              │ pwsh           │  ┌────────────────────────────────┐  │
│ Reforge      │ Claude · activo│  │ PowerShell / Claude / Neovim    │  │
│ Banco del Sol│ Codex · atención│ │                                │  │
│ ...          │ ...            │  └────────────────────────────────┘  │
├──────────────┴────────────────┴──────────────────────────────────────┤
│ Status discreto opcional: cwd | shell | agente | proceso / repo      │
└──────────────────────────────────────────────────────────────────────┘
```

En modo horizontal, tabs debajo o dentro de la barra superior; la superficie terminal no cambia de propietario ni se desmonta.

El diseño final (E11) no tiene barra de estado (decisión 30): el cwd va en la barra superior, el estado del LSP y los
diagnósticos en la línea de estado del editor, la rama en la vista Git del sidebar, y el shell/perfil en el ícono del tab.

---

# 11. Roadmap de ejecución y entregables por fase

## Fase 0 — Baseline verificable y trazabilidad

**Objetivo:** producir una línea de base compilable y reproducible antes de refactorizar.

**Tareas:**

1. Importar a este repositorio el código fuente de Terax del commit de origen, como snapshot (sin historial ni remote de upstream). Registrar el SHA en el README y en `.docs/`.
2. Verificar licencia Apache 2.0 de Terax y licencias de componentes/artefactos incluidos; conservar `LICENSE`, `NOTICE` (si existe), atribuciones y licencias de Ghostty/restty/xterm derivado si aplica (ver §14.3).
3. Unificar documentación en `.docs/`: reubicar toda la documentación importada de Terax (`TERAX.md`, `README.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` y `docs/`) en `.docs/origin-terax/`, como referencia de origen y no como instrucciones para lut. Descartar `AGENTS.md`/`CLAUDE.md` de Terax. **Hecho** (ver `.docs/origin-terax/ORIGIN.md`).
4. **Neutralizar el updater de Terax antes del primer build ejecutable:** quitar el endpoint de releases de Terax y su clave pública de `tauri.conf.json` (o desactivar el plugin) para que lut **nunca** descargue ni instale binarios de Terax. lut sí tendrá auto-actualización, pero con infraestructura propia (endpoint de releases de lut y clave de firma propia), que se configura cuando exista el pipeline de releases (Fase 7).
5. Auditar las llamadas de red salientes (módulo `net`, IA BYOK, updater, telemetría si la hubiera) y desactivar las que apunten a servicios de Terax o de terceros no necesarios para la terminal.
6. Instalar `pnpm` exacto y dependencias Rust/Zig/WASM requeridas por el proyecto (seguir las instrucciones del código importado).
7. Registrar OS, toolchains y prerequisitos; documentar comandos efectivos de build.
8. Ejecutar test/lint/check existentes; guardar baseline de fallos previos.
9. Compilar y abrir la app en Windows 11. Probar pwsh, WSL, splits, tabs, Ghostty/WebGPU/WebGL, agentes con hooks desactivados y activados con consentimiento.
10. **Aislamiento de identidad**, inmediatamente después del primer build válido y antes de cualquier uso real: bundle identifier, directorio de datos, nombres de stores persistidos, CLI auxiliar de hooks, marcadores de hooks en configuraciones de Claude/Codex, variables de entorno (`TERAX_PANE_ID` → equivalente de lut), nombres de socket/puerto/pipe del control server. Verificar que la instalación/desinstalación de hooks de lut no toca hooks de Terax ni de terceros. Volver a ejecutar el paso 9 para confirmar que no hubo regresiones.
11. Medir de forma inicial: cold start, memoria sin tabs, memoria con 4 panes, latencia de input, resize, switching, output de alto volumen. No optimizar todavía.
12. Crear lista de contratos de módulos y dependencias reales (import graph, Tauri commands).

El rebranding visual (títulos, About, iconos, textos) no es parte de la Fase 0.

**Entregable:** build reproducible, reporte baseline, registro de tests, matriz de dependencias, estrategia de licencias, identidad aislada de Terax y updater de Terax neutralizado.

**Gate:** no avanzar con borrado de módulos si baseline no es ejecutable o si existen fallos de origen sin documentar.

## Fase 1 — UI terminal-first mínima

**Objetivo:** tener una terminal funcionando dentro de shell visual nuevo.

**Tareas:**

1. Nuevo `AppShell` con área principal de terminal.
2. Integrar `TerminalStack` intacto con callbacks y lifecycle actuales.
3. Nueva barra/navegación de tabs horizontal/vertical.
4. Sidebar de proyectos placeholder ocultable, sin implementar persistencia nueva.
5. Theming básico y shortcuts de tabs/splits.
6. Hacer opcional/ocultar editor, explorer, Source Control, AI integrada y demás chrome; **no eliminar backend todavía**.
7. Tests para switch tab/split, salida TUI, reordenamiento, orientación y ocultamiento.

**Gate:** cambiar tabs, orientación, tema y sidebar no cierra ni reinicia procesos; TUI continúa funcional.

## Fase 2 — Separación de dominios y eliminación de IA BYOK

**Objetivo:** reducir acoplamiento manteniendo terminal y hooks.

**Tareas:**

1. Extraer `NavigationStore` y contratos mínimos desde `useTabs`.
2. Reducir responsabilidades de `App.tsx` por hooks/servicios.
3. Separar wrappers nativos compartidos de `modules/ai`.
4. Quitar `AiComposerProvider` y chat propio de flujo principal.
5. Separar estado `localAgent` de agentes CLI y notificaciones.
6. Convertir editor, Git y explorer a capabilities opcionales, lazy; decidir qué código mantener.
7. Remover dependencias sólo cuando no existan consumidores.
8. Ejecutar tests y analizar bundle.

**Gate:** sin configurar API key, arranca terminal y funcionan hooks/agentes CLI, la selección de shell actual (preferencia global `terminalShell`, previa a los perfiles de la Fase 3) y Spaces migrados.

## Fase 3 — Perfiles

**Objetivo:** configuración de shell y apariencia por instancia.

**Tareas:**

1. Modelo `TerminalProfile` y validación/migración.
2. Manager con CRUD + default.
3. Adaptador de perfil a `pty_open` para shell, args y env (ampliar contrato con compatibilidad si hace falta).
4. Picker de perfil en Nuevo Tab y split.
5. Override de tema/fuente por perfil o pane sin reinstanciar un proceso innecesariamente.
6. Soporte nativo Windows/WSL inicial y contratos de macOS/Linux.
7. Test de perfil faltante y manejo de errores.

**Gate:** abrir dos panes con shells y preferencias distintas, persistir y restaurar.

## Fase 4 — Proyectos y restauración

**Objetivo:** resolver el problema de reconstruir el entorno al arrancar.

**Tareas:**

1. Modelo versionado de `Project`, su estado guardado y `RunningWorkspace`.
2. Migrar `Spaces` actual conservando datos.
3. Confirmación para relanzar comandos (ejecutar / siempre en este proyecto / no ejecutar).
4. Guardar árbol, orden, ratios, cwd, perfil, active tab y comandos que siguen corriendo.
5. Ejecutar restauración con estado, confirmación y guardas contra duplicados.
6. Soporte multi-proyecto activo y reglas de foco/instancia; abrir otros proyectos desde la app (PRJ-017).
7. Restauración de la última sesión al iniciar lut (PRJ-016): persistir qué proyectos estaban abiertos y cuál era el activo; al arrancar, reabrirlos con el algoritmo de §8.4.
8. Export/import de esquema portable (sin secretos).
9. Tests unitarios de serialización e integración de arranque, incluida la restauración de la última sesión.

**Gate:** reiniciar app, abrir proyecto de tres panes y recuperar su estructura; iniciar sólo comandos autorizados, informar errores y no duplicar procesos.

## Fase 5 — Experiencia avanzada de agentes

**Objetivo:** aprovechar infraestructura existente sin API keys.

**Tareas:**

1. Integrar reducer detallado de agentes CLI con nuevo store/UI.
2. Instalar hooks mediante preview/diff y consentimiento; soportar remover sólo hooks propios.
3. Estado por tab/pane y notificaciones nativas.
4. Shortcut de foco al agente que necesita atención.
5. Timeline opcional y subagentes cuando la CLI/fuente ofrece datos. **No planificado** (decisión 27).
6. Gestión de frecuencia, retención y privacidad.
7. Integración opcional de métricas por statusLine sin pisar config del usuario.
8. Tests de eventos fuera de orden, errores, cierre, timeout y fallback sin hooks.

**Gate:** dos sesiones simultáneas en el mismo directorio muestran estados correctos y la aprobación se resuelve en la terminal correcta.

## Fase 6 — Herramientas secundarias y UX refinada

**Objetivo:** completar carácter premium sin convertir producto en IDE.

**Tareas:** command palette, menús contextuales, editor/diff/Git en ventana/panel secundario opcional, temas personalizados, presets visuales, atajos avanzados, pulido de densidad, ergonomía y accesibilidad.

**Gate:** ningún tool opcional es necesario para abrir una terminal; rendimiento sin herramientas abiertas permanece comparable al baseline.

## Fase 7 — Multiwindow y portabilidad completa

**Objetivo:** múltiples ventanas por proyecto y soporte real macOS/Linux.

**Tareas:** definir ownership de PTY/renderer por ventana; creación/cierre de ventanas; transferencia de tab/pane si se decide; restauración de geometría por monitor; pruebas OS específicas de clipboard, IME, WSL, fonts, WebKit y DPI; empaquetado y actualizaciones.

**Auto-actualización de lut:** pipeline de releases propio, clave de firma propia (nunca la de Terax), endpoint de lut, verificación de firma obligatoria, canal configurable (estable/beta) y opción de desactivarla. Este trabajo puede adelantarse si se necesita distribuir lut antes de la Fase 7.

**Gate:** ventanas se recuperan sin crear sesiones huérfanas, sin leaks visibles y sin errores de foco/propiedad de PTY.

---

# 12. Estrategia de desarrollo con agentes de código

## 12.1. Normas obligatorias para Codex/Claude

1. **Leer antes de modificar:** la arquitectura del módulo afectado y archivos completos relevantes. `.docs/origin-terax/TERAX.md` y `.docs/origin-terax/docs/` sirven como referencia técnica del código heredado, **no** como reglas de lut.
2. **No desarrollar desde intuición:** encontrar el punto de extensión real y los tests del módulo.
3. **No reescribir core funcional** (PTY, WASM/renderer, protocolo) sólo por simplificación estética.
4. **Una fase, una familia de cambios:** evitar refactorización grande simultánea de TS y Rust sin gates.
5. **No borrar funciones de IA/IDE prematuramente:** primero desacoplar, demostrar que CLI/hooks funcionan; luego retirar dependencias no usadas.
6. **Mantener tests:** si se mueve una función pura, trasladar o ampliar sus tests.
7. **No cambiar comportamiento de CLI externa:** la app no intercepta ni falsifica prompts, y no requiere claves API.
8. **Documentar decisiones:** ADR breve si cambia un contrato, un modelo persistido o una restricción de plataforma.
9. **Respetar cross-platform:** abstraer paths, shells y quoting; pruebas en Windows son obligatorias.
10. **Seguridad antes que comodidad:** scripts importados, comandos de inicio, hooks y permisos nunca se activan en silencio.
11. **No declarar un componente terminado sin verificación:** informar comando ejecutado, resultado, errores, riesgos y pruebas pendientes.
12. **Mantener el producto terminal-first:** ninguna mejora opcional puede invadir el área central sin elección del usuario.

## 12.2. Instrucción de primera tarea

> **No empieces implementando las funcionalidades nuevas.** Primero importa el código de Terax del commit de origen, neutraliza su updater, ejecuta el baseline, documenta resultados y realiza un análisis estático de dependencias para los módulos `App`, `tabs`, `spaces`, `terminal`, `agents`, `control` y `ai`. Entrega un plan de cambios por commits y una prueba de concepto mínima de UI terminal-first que renderice `TerminalStack` sin re-instanciar los PTY al cambiar orientación. No elimines código del producto anterior hasta demostrar que la integración con shells y agentes sigue funcionando.

## 12.3. Reglas de pequeños PRs/commits

Un PR ideal debería incluir: objetivo, archivos cambiados, cambios funcionales, riesgos, pruebas ejecutadas, compatibilidad y screenshots sólo si afectan UI. Evitar commits gigantes con migración de estructura, deps, herramientas y diseño a la vez.

Orden sugerido de PRs iniciales:

- PR-001: baseline, documentación y verificación de build.
- PR-002: `AppShell` y `TerminalStack` encapsulado sin cambios de renderer.
- PR-003: adaptador de tabs visuales y orientación configurable.
- PR-004: nueva sidebar de proyectos vacía y estado de navegación.
- PR-005: aislamiento de `AiComposerProvider`/chat BYOK.
- PR-006: perfiles y contratos entre profile → pane → PTY.
- PR-007: schema de proyectos versionado y migration de Spaces.
- PR-008: orquestador de arranque de proyecto.
- PR-009: puente del reducer de agentes al UI.

Los PRs son hitos, no obligación de numeración literal.

---

# 13. Testing, calidad y rendimiento

## 13.1. Comandos base encontrados en Terax

Del `package.json` revisado:

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm build
pnpm analyze:bundle
pnpm analyze:eager
pnpm bench:ghostty
```

Del `TERAX.md` para Rust:

```bash
cd src-tauri
cargo clippy --all-targets --locked -- -D warnings
cargo nextest run --locked
# fallback: cargo test --locked
```

Estos comandos deben ejecutarse en un entorno con dependencias instaladas y toolchains correctos. Algunos benchmarks y harnesses visuales exigen prerequisitos adicionales. Registrar los tests que ya fallan en el código importado antes de atribuirlos a cambios propios.

## 13.2. Matriz de pruebas funcionales

| Escenario                                       | Resultado esperado                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Abrir pwsh                                      | Shell interactiva y prompt correcto                                                                              |
| Abrir WSL Ubuntu                                | Shell con cwd correcto y teclado operativo                                                                       |
| Ejecutar Neovim                                 | Pantalla alterna y combinaciones de teclas funcionan                                                             |
| Ejecutar lazygit                                | Mouse/resize/Unicode correctos                                                                                   |
| Switch horizontal → vertical                    | PTY y output siguen vivos, sin reiniciar procesos                                                                |
| Colapsar proyectos sidebar                      | Ningún proceso se detiene                                                                                        |
| Split y resize continuo                         | Una sesión por pane, geometry/TTY consistentes                                                                   |
| Tabs ocultas con `pnpm dev`                     | Proceso continúa, output no corrompido al volver                                                                 |
| Cerrar tab con proceso activo                   | Política de confirmación y cleanup                                                                               |
| Guardar y restaurar proyecto                    | Topología, perfiles, cwd, ratios y comandos correctos                                                            |
| Abrir proyecto dos veces                        | No duplica accidentalmente procesos                                                                              |
| Abrir perfil inexistente                        | Error reparable, sin crash general                                                                               |
| Claude + Codex en tabs distintos                | Estados y notificaciones correlacionados                                                                         |
| Dos Claude en mismo cwd                         | Cada evento pertenece a su PTY                                                                                   |
| Desinstalar hooks                               | Preserva hooks ajenos                                                                                            |
| Hooks ausentes                                  | Terminal funciona; degradación de badges explícita                                                               |
| Proveedor BYOK sin key                          | Terminal y agentes CLI funcionan igual                                                                           |
| Reiniciar con comando peligroso a relanzar      | Exige confirmación antes de ejecutar                                                                             |
| Cambiar tema/fuente                             | Presentación se actualiza sin reiniciar proceso                                                                  |
| Cerrar y reabrir lut con dos proyectos abiertos | Se restauran ambos proyectos, el activo y sus layouts; comandos según política                                   |
| Terax instalado en la misma máquina             | lut no lee ni escribe datos, stores, hooks ni variables de Terax; desinstalar hooks de lut preserva los de Terax |
| Comprobación de actualizaciones                 | Sólo consulta el endpoint de lut; rechaza binarios sin firma válida de lut                                       |

## 13.3. Matriz por plataforma

- **Windows 11:** ConPTY, PowerShell 7, CMD, WSL Ubuntu, rutas `C:\` y `D:\`, Job Object, clipboard, IME y WebView2.
- **Linux:** PTY Unix, Bash/Zsh/fish, permisos, WebKitGTK, xdg, portapapeles X11/Wayland, procesado de paths y fonts.
- **macOS:** PTY Unix, zsh/fish, WebKit/WKWebView, composición, native menu, teclado Cmd/Option y DPI.
- **Todos:** Unicode, Nerd Fonts, UI responsiveness, variaciones de GPU y fallback, sesiones ocultas, notificaciones, apps TUI.

## 13.4. Métricas de rendimiento

No fijar cifras absolutas sin baseline. Registrar inicialmente:

- Cold-start, primera terminal visible y tiempo hasta prompt.
- Latencia de entrada a eco de texto; stalls P95/P99.
- FPS y estabilidad visual durante output abundante.
- RAM y GPU al inicio, con 1/4 panes y después de cerrar todos.
- Consumo de CPU en reposo y con tabs ocultas.
- Memoria de scrollback a largo plazo y liberación tras cierre.
- Reflow y errores durante resize/zoom/DPI.
- Tiempo de restaurar proyecto con múltiples herramientas.

**Criterio de no regresión:** cualquier empeoramiento material respecto al baseline debe investigarse antes de aceptar el cambio; documentar umbrales una vez existan mediciones.

## 13.5. Pruebas de robustez

- Cerrar aplicación mientras un hook espera decisión.
- Matar inesperadamente el proceso de shell o el agente.
- Reiniciar frontend/HMR durante desarrollo.
- Hook duplicado, JSON malformado, fuera de orden y tardío.
- Cerrar proyecto mientras se restauran panes.
- Desconexión de webview durante stream PTY.
- `cwd` no accesible, disco/montaje ausente, distro WSL desinstalada.
- Comando de startup que jamás devuelve prompt.
- Corrupción/parcialidad de archivo de settings; migración con rollback.
- Cambiar tabs con editor secundario cerrado.
- Fallback WebGPU → WebGL.

---

# 14. Seguridad, privacidad, licencias y mantenimiento

## 14.1. Seguridad de ejecución

- Ejecutar programas mediante argv cuando sea posible; separar argumentos en arrays y no interpolar rutas en strings de shell.
- Si los comandos de proyecto se ejecutan dentro de shell, usar un mecanismo de entrada/quoting de la shell activa, no construir una línea no escapada.
- Mostrar claramente qué se va a relanzar y con qué cwd/entorno.
- Nunca registrar tokens de auth ni variables de entorno secretas.
- Mantener restricciones de workspace authorization existentes hasta que se evalúe su modelo de amenaza.
- Evitar puertos de control abiertos a otras máquinas; autenticar solicitudes locales.
- Correlacionar cada respuesta de permiso con solicitud/PTY exacta.
- Sanitizar payloads de hooks; límites de longitud, frecuencia y persistencia.
- Proteger rutas de archivos y la funcionalidad de “abrir archivo” desde output o hooks.

## 14.2. Privacidad

El proyecto debe funcionar totalmente local para terminal/sesiones/proyectos y no enviar prompts, rutas, transcripciones ni métricas de agentes a servidores propios. La información que podría persistirse localmente debe categorizarse:

- **Permitido por defecto:** IDs, agente, estado, tiempo, PTY, tab, proyecto, metadatos mínimos.
- **Opt-in explícito:** comandos, nombres de herramientas, previews, mensajes, errores detallados, timeline persistente.
  El opt-in para guardar los comandos que siguen corriendo (para relanzarlos, §8) es la opción de inicio “restaurar la
  última sesión” con el relanzamiento activado, que advierte que esas líneas se guardan localmente y pueden contener
  secretos (decisión 28).
- **No guardar por defecto:** prompts completos, contenido leído/escrito, transcripciones, variables de entorno, tokens.

## 14.3. Licenciamiento y atribuciones

La revisión inspeccionada declara licencia **Apache-2.0** en `LICENSE`, `package.json` y `Cargo.toml`. No asumir que todos los assets y componentes incluidos tienen idéntica licencia. La configuración Tauri ya incluye licencias empaquetadas de componentes de terminal, incluido Ghostty/restty y una parte derivada de xterm.js. La auditoría de lanzamiento debe verificar y preservar cada `LICENSE`, `NOTICE`, marca de terceros y obligaciones aplicables.

**Licencia de lut:** Apache-2.0 (misma que Terax). El `LICENSE` de la raíz es la licencia de lut. La licencia de Terax, con su aviso de copyright y una nota de procedencia y modificación, se distribuye en `public/licenses/terax.txt` (Vite la incluye en la app; disponible para una futura pantalla de licencias).

Importar y modificar el código está permitido, pero **no** autoriza eliminar avisos requeridos ni presentar componentes de terceros como código original. Obligaciones mínimas al redistribuir lut:

- **Créditos:** nota (`NOTE`) en el README indicando que lut parte de Terax (enlace al repositorio y SHA de origen).
- **Licencia:** conservar una copia de la licencia Apache-2.0 de Terax y su `NOTICE` si existe; si lut agrega su propio `NOTICE`, incluir allí los avisos de Terax.
- **Aviso de modificación (Apache-2.0 §4b):** dejar constancia de que los archivos derivados fueron modificados respecto al original (p. ej. una declaración en `NOTICE`/README más el historial git del repo; en archivos con cabecera de licencia, añadir nota de modificación).
- **Terceros:** preservar las licencias de Ghostty/restty, del código derivado de xterm.js y de cualquier otro componente empaquetado.

Definir nueva marca y bundle identifier sin reutilizar identidades de publicación/actualización que pertenezcan a Terax.

## 14.4. Relación con Terax tras la importación

lut **no** mantiene dependencia con upstream: no hay remote, no hay merges ni sincronización periódica. El código importado pasa a ser código propio de lut.

- El SHA de origen se conserva sólo como dato de procedencia y atribución.
- Si en Terax aparece un fix concreto que interese (p. ej. seguridad de PTY o ConPTY), se porta manualmente como un cambio propio de lut, con su propio test. Esto es una decisión puntual, no un proceso.
- Libertad total para renombrar, mover o reescribir código; las restricciones vienen de los invariantes técnicos (§5.4, §6) y de las pruebas, no de la compatibilidad con Terax.
- Mantener separadas en commits las personalizaciones visuales y las modificaciones al motor (PTY/renderer/control protocol), para facilitar diagnóstico y reversión.

---

# 15. Entregables que debe producir el agente implementador

Al terminar la Fase 0, exigir estos artefactos dentro del repo. **Toda la documentación de lut vive en `.docs/`**; la documentación heredada de Terax está en `.docs/origin-terax/` sólo como referencia (Fase 0, tarea 3).

1. `.docs/architecture/current-state.md`: mapa real de módulos React/Rust, stores, side effects e IPC, con rutas verificadas.
2. `.docs/architecture/module-dependencies.md`: relaciones entre `app`, `terminal`, `tabs`, `spaces`, `agents`, `control`, `ai`, `editor`, `git`.
3. `.docs/architecture/target-architecture.md`: contratos propuestos, invariantes, flujo de procesos y renderer.
4. `.docs/architecture/migration-plan.md`: secuencia de refactor por PRs y tests.
5. `.docs/decisions/`: ADRs para cambios de contratos/persistencia.
6. `.docs/testing/baseline.md`: build, versiones, tests ejecutados, fallos conocidos y baseline de rendimiento.
7. `.docs/product/requirements.md`: rastreo de IDs TER/PRO/PRJ/UX/AGT a implementación y pruebas.
8. README de lut con primera ejecución, contribución, SHA de origen y la nota (`NOTE`) de créditos a Terax.

**No es necesario crear todas estas carpetas antes de conocer la estructura real**; son nombres sugeridos para controlar el trabajo.

---

# 16. Checklist de aceptación global

## Terminal y navegación

- [ ] PowerShell/WSL funcionan correctamente.
- [ ] Neovim y lazygit funcionan con teclado, selección y resize.
- [ ] Cambiar orientación de tabs no reinicia PTYs.
- [ ] Cambiar tabs/proyectos mantiene procesos y output vivos.
- [ ] Splits no provocan leaks evidentes del renderer.
- [ ] Tema/fuente/cursor son personalizables.

## Proyectos y perfiles

- [ ] Mi entorno de trabajo (tabs, splits, cwd, perfiles y procesos) se guarda solo mientras trabajo.
- [ ] Puedo restaurarlo después de reiniciar la aplicación.
- [ ] Al abrir lut se restaura la última sesión (proyectos abiertos, proyecto activo y layouts).
- [ ] Puedo abrir otros proyectos guardados sin cerrar los que ya están abiertos.
- [ ] Cada pane puede tener shell/cwd/perfil propios.
- [ ] Los comandos relanzados arrancan una sola vez y sólo con confirmación o aprobación previa.
- [ ] Los errores de configuración no bloquean toda la aplicación.
- [ ] Un proyecto importado no relanza comandos sin consentimiento.

## Agentes

- [ ] Puedo ejecutar `claude` y `codex` oficiales con su propia autenticación.
- [ ] No necesito API keys configuradas en la aplicación.
- [ ] Estados de agentes corresponden al pane correcto incluso si comparten cwd.
- [ ] Finalizaciones y solicitudes de atención aparecen en tabs y notificaciones.
- [ ] Puedo ir al pane que necesita atención mediante acción/atajo.
- [ ] Instalar/desinstalar hooks no rompe configuraciones existentes.
- [ ] La terminal funciona aunque el bridge de agentes falle o no esté instalado.

## Producto

- [ ] La terminal es visualmente predominante.
- [ ] Editor/Git/IA propia no se imponen en la UI.
- [ ] Personalización visual es estable sin desmontar sesiones.
- [ ] Se conservaron avisos de licencia obligatorios y la nota de créditos a Terax en el README.
- [ ] lut no comparte datos, hooks ni updater con una instalación de Terax.
- [ ] La auto-actualización sólo usa infraestructura y firma propias de lut.
- [ ] Tests de frontend y Rust ejecutados con resultados documentados.
- [ ] Riesgos y pendientes multiplataforma explícitos.

---

# 17. Referencias de código y documentación

Los enlaces siguientes apuntan al **commit de origen** importado (SHA de la portada). Sirven para consultar el estado original del código; una vez importado, la fuente de verdad es el código de este repositorio.

## Código Terax

- [Repositorio anclado](https://github.com/crynta/terax-ai/tree/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9)
- [TERAX.md / arquitectura viva](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/TERAX.md)
- [Manifest frontend](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/package.json)
- [Manifest Rust](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src-tauri/Cargo.toml)
- [Configuración Tauri](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src-tauri/tauri.conf.json)
- [Coordinador App](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/app/App.tsx)
- [WorkspaceSurface](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/app/components/WorkspaceSurface.tsx)
- [TerminalStack](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/terminal/TerminalStack.tsx)
- [TerminalPane](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/terminal/TerminalPane.tsx)
- [PaneTreeView](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/terminal/PaneTreeView.tsx)
- [Helpers de splits](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/terminal/lib/panes.ts)
- [useTabs](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/tabs/lib/useTabs.ts)
- [TabBar](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/tabs/TabBar.tsx)
- [Space Store](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/spaces/lib/store.ts)
- [Space Serialization](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/spaces/lib/serialize.ts)
- [Space Hydration](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/spaces/lib/useSpacesBoot.ts)
- [Space Persistence](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/spaces/lib/useSpacePersistence.ts)
- [Rust PTY](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src-tauri/src/modules/pty/mod.rs)
- [Rust PTY Session](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src-tauri/src/modules/pty/session.rs)
- [Rust Hooks](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src-tauri/src/modules/agent.rs)
- [Rust Agent Events](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src-tauri/src/modules/agent_events.rs)
- [Agent Model Types](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/agents/model/types.ts)
- [Agent Reducer](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/agents/model/reducer.ts)
- [Agent Notifications Bridge](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/agents/components/AgentNotificationsBridge.tsx)
- [Hooks Config frontend](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/control/lib/hooksConfig.ts)
- [Settings](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/src/modules/settings/store.ts)
- [License Apache 2.0](https://github.com/crynta/terax-ai/blob/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9/LICENSE)

## Referencias externas

- [Claude Code — Hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code — CLI](https://code.claude.com/docs/en/cli-reference)
- [Tauri v2](https://v2.tauri.app/)
- [portable-pty](https://docs.rs/portable-pty/latest/portable_pty/)
- [Ghostty](https://ghostty.org/)
- [Repositorio Terax](https://github.com/crynta/terax-ai)

---

# 18. Mensaje de arranque listo para entregar a Codex/Claude

Copiar este mensaje como primer prompt junto a este documento:

> Vas a implementar **lut** (marca siempre en minúsculas; ejecutable final `lut`), una terminal desktop multiplataforma, **terminal-first**, a partir del código fuente de Terax importado a este repositorio. No es un fork mantenido: no hay upstream, merges ni sincronización con Terax. El documento `.docs/proposal.md` contiene los requisitos, decisiones, hallazgos del código, alcance, roadmap y criterios de aceptación. Léelo completo antes de actuar. No implementes todas las fases de una vez. Empieza por **Fase 0 — Baseline verificable**: importa el código del commit de origen, neutraliza el updater de Terax, valida build, tests, dependencias y arquitectura real, y aísla la identidad de lut (bundle identifier, datos, hooks, variables de entorno) para que no comparta nada con una instalación de Terax. Toda la documentación nueva va en `.docs/`. Produce un plan de refactorizaciones pequeñas, con identificación de los puntos de acoplamiento entre `App.tsx`, `useTabs.ts`, `Spaces`, `TerminalStack`, la IA BYOK y los hooks de agentes CLI. Mantén intacto el PTY, Ghostty/WASM y el renderer mientras no exista evidencia de que necesitan cambios. No elimines código de agentes CLI ni supongas que dependen de API keys: las claves pertenecen al subsistema de IA propia de Terax, que será desacoplado. Una vez completada la fase inicial, propone una prueba de concepto para orientación vertical/horizontal de tabs sin desmontar sesiones. Registra explícitamente resultados de comandos, tests, limitaciones y siguientes commits.

---

# 19. Resumen de la decisión final

El valor de **lut** no está en reinventar la PTY ni fabricar otro agente de IA. Está en ofrecer una terminal de primera categoría que guarde y reconstruya el entorno de desarrollo, permita una interfaz moderna profundamente configurable y conozca el estado de agentes CLI ejecutados con las suscripciones existentes.

La ruta más eficiente es **importar el código de Terax como punto de partida, conservar sus piezas técnicamente difíciles y reconstruir su experiencia de aplicación**, desarrollándolo en este repositorio como producto independiente, sin dependencia de upstream y con los créditos debidos en el README. El esfuerzo central es separar un frontend hoy orientado a múltiples funciones de IDE/IA, convertir Spaces en proyectos/presets completos y materializar una integración UI con los eventos de Claude Code/Codex que el backend ya recibe parcialmente.

**Primera prioridad real: producir una terminal-first funcional sin romper la terminal existente.** Luego implementar perfiles y proyectos. Finalmente explotar los hooks de agentes para crear la experiencia diferenciadora.
