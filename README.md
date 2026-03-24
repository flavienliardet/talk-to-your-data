# Databricks Multi-Agent Chat: Genie + LangGraph

A full-stack **chat application** that talks to a **multi-agent system** deployed on Databricks. The agent is built and deployed from a **notebook**; the **web app** is the user-facing chat UI that streams responses from the deployed endpoint.

---

## What This Repo Contains

| Part | Role |
|------|------|
| **Notebook** (`langgraph-multiagent-genie-multi-requetes.ipynb`) | Defines the multi-agent logic (LangGraph + Genie), wraps it as an MLflow agent, and **deploys it as a Databricks Agent Serving endpoint**. |
| **Web app** (React + Express) | Chat interface that sends user messages to that **same endpoint**, streams the reply, and persists history (Lakebase/Postgres). |

Flow : **notebook → builds & deploys the agent → creates the endpoint**. **App → calls the endpoint → shows the chat**. 
Both are in one repo so you can see the full flow.

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NOTEBOOK (Databricks)                                                  │
│  • Define LangGraph multi-agent (instruction_builder, decomposer,       │
│    genie_worker, synthesizer, memory, etc.)                             │
│  • Wrap with MLflow ResponsesAgent                                      │
│  • log_model → register → deploy to Agent Serving                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  Agent Serving Endpoint       │
                    └───────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  WEB APP (this codebase)                                                │
│  • User types in chat → POST /api/chat                                  │
│  • Server calls the endpoint with message + headers (persona, mode…)    │
│  • Streams response back to the UI (Vercel AI SDK)                      │
│  • Optional if authentification : save chats in Lakebase/│Postgres                                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Project structure (relevant parts)

- **`langgraph-multiagent-genie-multi-requetes.ipynb`** – Agent definition, MLflow wrap, deployment.
- **`client/`** – React chat UI (messages, input, persona/mode selectors, streaming).
- **`server/`** – Express API; **`routes/chat.ts`** calls the agent endpoint and streams back.
- **`graph_visualization.png`** – Visualization of the multi-agent graph (version without RAG agent)
- **`architecture.png`** – Visualization of the app's architecture 

--- 

## What the Notebook Does

The notebook implements a **multi-agent system** for answering analytical questions over the data from a luxury fashion house, using **Databricks Genie** (text-to-SQL) as one of the agents.

### 1. Multi-agent graph (LangGraph)

Is consisted of 2 modes 

- **Normal mode**  
  - User question → **simple_genie** → single Genie call (one SQL path) → optional memory save → end.

- **Approfondi (deep) mode**  
  - **memory_get**: Load long-term memory (DatabricksStore) and inject into context.  
  - **instruction_builder**: Turn the user question into structured instructions for Genie (tables, columns, rules: aggregation, deviation, robustness, etc.) using the LLM and semantic context (Unity Catalog table descriptions).  
  - **decomposer**: Decide if the question needs one or several sub-questions; output a list of independent sub-questions.  
  - **genie_worker**: For each sub-question, call Genie (fan-out). Each worker runs a Genie query and returns insight + SQL + result table.  
  - **synthesizer**: Merge all sub-results into one coherent answer.  
  - **memory_save**: Optionally update long-term memory from the turn.

So in “Approfondi” you get: **enrich question → decompose → run multiple Genie queries → synthesize**.

### 2. Genie integration

- **GenieAgent** (Databricks Genie) is used to run natural-language questions against your Genie Space (structured data / SQL).
- The graph can pass **persona** (e.g. Stock vs Cdistrib) and **semantic context** (table/column descriptions) so Genie is guided to the right schema and rules.
- The notebook can also:
  - Set up **checkpoint tables** (LangGraph state) and **DatabricksStore** (vector store for long-term memory and optional RAG over schema).
  - Generate **semantic context files** from Unity Catalog (e.g. `semantic_context_stock.txt`, `semantic_context_cdistrib.txt`) and optionally index them in the store for “Approfondi” RAG.

### 3. Wrapping and deployment

- The LangGraph workflow is wrapped in **MLflow `ResponsesAgent`** (`LangGraphResponsesAgent`) so it conforms to Databricks Agent Serving (request/response and streaming).
- **log_model** is called with the agent code (`agent.py`), dependencies, and **resource declarations** (LLM endpoint, Lakebase, Genie Space, SQL warehouse, tables, etc.) for automatic auth passthrough.
- The model is then **registered** in Unity Catalog and **deployed** with `agents.deploy(...)` to an **Agent Serving endpoint**.

After running the notebook, you get an **endpoint URL** that the chat app will use.

---

## What the App Does

The app is a **classic chat UI** that uses the endpoint produced by the notebook.

### 1. Sending messages to the agent

- User writes in the chat; the frontend sends **POST /api/chat** with:
  - Conversation id, message, and optionally: **persona** (Stock / Cdistrib), **thinking mode** (Normal / Approfondi), **custom instructions**, **response level** (exploratoire / statistique), **genie_conversation_id** (to keep Genie conversation continuity).
- The server uses the **Vercel AI SDK** and a **Databricks AI provider** to call your **Agent Serving endpoint** (the one deployed from the notebook).
- These options are passed as **headers** so the agent can branch (e.g. Normal vs Approfondi) and use the right Genie context (persona, schema, etc.).

### 2. Streaming and UI

- The endpoint streams chunks back; the server forwards them to the client.
- The app can show **graph steps** (e.g. “Enrichissement de la question”, “Requête Genie”, “Synthèse des résultats”) when the agent emits `graph_step` events.
- It can also show **suggested questions** and **Genie truncation** notices when the agent sends the corresponding custom payloads.
- **StreamCache** is used so that reconnection or continuation doesn’t re-trigger the full request.

### 3. Persistence and auth

- **With database (Lakebase/Postgres)**: Chats and messages are stored; sidebar shows history; last config (persona, thinking mode) can be stored per chat.
- **Without database (ephemeral)**: Chat works but history is not saved.

Auth is **header-based**, typically set by a reverse proxy in front of the app.

### 4. Deployment of the app

- The app itself is deployed separately from the agent (via **Databricks Asset Bundle**): `databricks bundle deploy` + `databricks bundle run databricks_chatbot`.
- In `databricks.yml` you configure the **serving endpoint name** (the agent you deployed from the notebook) so the app knows which endpoint to call.

---

## Main Features (Summary)

### Notebook

- **Multi-agent LangGraph**: Normal (single Genie call) vs Approfondi (enrich → decompose → multi-Genie → synthesize).
- **Genie**: Text-to-SQL over your Genie Space with persona and semantic context.
- **Long-term memory**: Optional DatabricksStore + checkpoint tables for RAG and state.
- **MLflow + deployment**: Log and deploy as Databricks Agent Serving endpoint with declared resources for auth.

### App

- **Chat UI**: Send messages, stream responses, optional graph-step and suggested-questions display.
- **Configurable agent behavior**: Persona (Stock / Cdistrib), thinking mode (Normal / Approfondi), response level, custom instructions, Genie conversation continuity.
- **Optional persistence**: Lakebase/Postgres for chat history and per-chat config.
- **Deployment**: Express + React, deployable via Databricks Asset Bundle, calling your deployed agent endpoint.

---

## How to Use This Repo

1. **Deploy the agent (notebook)**  
   - Open `langgraph-multiagent-genie-multi-requetes.ipynb` on Databricks.  
   - Set Instance Names (Lakebase instance, Genie Space, endpoints, etc.).  
   - Run all cells: setup store/checkpoints → build graph → log_model → register → deploy.  
   - Note the **Agent Serving endpoint name** created.

2. **Configure and run the app**  
   - Point the app to that endpoint (in `app.yml`).  
   - Run locally with `npm run dev` or deploy with the bundle; open the chat UI and start a conversation.

3. **Optional**  
   - Enable Lakebase in the app for persistent chat history.  
   - Use the same Lakebase instance (and schema) in the notebook for checkpoints and store if you want shared state/memory.

---


