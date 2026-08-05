# **Product Requirement Document (PRD)**

**Project Title:** Multi-Model AI Engine & Vector Engine (RAG Chatbot \+ Certificate Verification)  
**Target Execution Date:** July 2026  
**Core Architecture:** Firebase Hosting (Frontend) \+ GCP Cloud Run (Backend) \+ Neon PostgreSQL (pgvector)  
**Target Audience:** \~50 internal employees

## **1\. Objectives & System Scope**

* **Database & Hosting Migration:** Replace Supabase's fixed $25/month plan with a serverless, pay-as-you-go GCP \+ Neon architecture.  
* **Document RAG System:** Enable employees to run low-latency conversational queries across \~20 multi-page internal manuals (\~1,000 total pages).  
* **Certificate Validation Pipeline:** Automated visual data extraction and logical rule-checking for \~200 certificates/month.  
* **Cost Efficiency Goal:** Keep total combined infrastructure and AI API spending **under $8.00/month**.

## **2\. Technical Architecture & Tech Stack Matrix**

| Subsystem / Layer | Service / Model | Role & Technical Specs |
| :---- | :---- | :---- |
| **Frontend Hosting** | **Firebase Hosting** | Static SPA / Next.js build served via Google Edge CDN. Zero cold starts ($0/mo). |
| **Backend API** | **GCP Cloud Run** | Containerized FastAPI / Express API server. Scaled min-instances=0 ($0/mo). |
| **API Proxy / Routing** | **Firebase Rewrites** | Directs /api/\*\* traffic to Cloud Run to eliminate browser CORS issues. |
| **Database & Vector Store** | **Neon PostgreSQL** | Serverless Postgres \+ pgvector extension \+ tsvector hybrid search. |
| **Object Storage** | **Google Cloud Storage (GCS)** | Stores raw uploaded PDF manuals and certificate images (5 GB free tier). |
| **Secrets Management** | **GCP Secret Manager** | Securely manages Neon DB strings and AI API keys for Cloud Run instances. |
| **Document OCR / Parser** | **MiniMax M3** | Parses complex multi-modal PDFs (text, tables, layouts) into clean Markdown. |
| **Embedding Model** | **Gemini Embedding 2** | gemini-embedding-2 configured with Matryoshka output dimension 1536. |
| **Certificate Extractor** | **DeepSeek V4 Flash** | Multimodal/JSON mode for rapid key-value field parsing. |
| **Certificate Judge** | **Qwen Reasoning Model** | Deep CoT (Chain-of-Thought) logic validation against company compliance rules. |
| **RAG Chatbot LLM** | **DeepSeek V4 Flash** | Conversational model with native prompt caching enabled for reduced latency and cost. |

## **3\. Core Operational Workflows**

### **Workflow A: Infrastructure & API Routing**

```

[ User Browser ]
       │
       ├─── (Static Web UI / Edge CDN) ───> [ Firebase Hosting ]
       │
       └─── (API Calls: /api/*) ──────────> [ Firebase Proxy Rewrite ]
                                                     │
                                                     ▼
                                            [ Cloud Run Backend API ]
                                                     │
               ┌─────────────────────────────────────┼─────────────────────────────────────┐
               ▼                                     ▼                                     ▼
      [ GCS Bucket ]                        [ Neon DB (pgvector) ]                 [ External AI APIs ]
    (PDFs & Cert Images)                   (Vectors & Audit Logs)               (Gemini, DeepSeek, Qwen)

```

### **Workflow B: Document Ingestion & Chunking Pipeline**

1. **Upload:** User uploads PDF to Google Cloud Storage (GCS) via Cloud Run backend.  
2. **Parsing:** **MiniMax M3** extracts raw content into structured Markdown.  
3. **Parent-Child Chunking:**  
   * **Parent Chunk:** \~800–1,000 tokens (retains complete paragraph/table context).  
   * **Child Chunk:** \~200 tokens (vectorized for granular search precision).  
4. **Vector Embedding:** **Gemini Embedding 2** generates 1536-dimensional vectors for child chunks.  
5. **DB Insertion:** Store parent text, child text, and child embeddings into Neon DB linked by foreign keys.

### **Workflow C: Certificate Extraction & Verification Pipeline**

1. **Extraction:** Certificate file sent to **DeepSeek V4 Flash** to parse mandatory fields into strict JSON (e.g., Name, ID Number, Expiry Date, Issuing Authority).  
2. **Logical Verification:** Extracted JSON \+ business compliance rules passed to **Qwen Reasoning Model**.  
3. **Evaluation:** Qwen executes logic checks (e.g., expiration date validity, authority string match) and outputs a detailed reasoning trace along with a status rating (PASS, FAIL, or REQUIRES\_HUMAN\_REVIEW).  
4. **Audit Logging:** Save extracted JSON, confidence scores, and judge reasoning trace into Neon DB.

### **Workflow D: RAG Chatbot Query Pipeline**

1. **Semantic Caching:** System checks query\_cache table in Neon (similarity \> 0.93). If matched, return cached response immediately ($0 LLM cost).  
2. **Hybrid Retrieval:** If cache miss, execute a single SQL query in Neon combining **vector similarity search** (pgvector \<=\>) and **full-text search** (tsvector BM25).  
3. **Parent Context Fetch:** Retrieve top 3 matching child vectors ($K=3$), but pull their associated **Parent Text Chunks** (\~1,000 tokens total).  
4. **Generation:** Send query \+ parent context to **DeepSeek V4 Flash** (leveraging static prompt caching) to generate the final response.

## **4\. Database Schema Specifications (Neon PostgreSQL)**

SQL

```

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Document Metadata
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Parent Chunks Table
CREATE TABLE parent_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    page_number INT
);

-- Child Vector Chunks Table
CREATE TABLE child_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES parent_chunks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    tsv_content TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- Indexes for Fast Search
CREATE INDEX ON child_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON child_chunks USING gin (tsv_content);

-- Certificate Audit Log
CREATE TABLE certificate_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_url TEXT NOT NULL,
    extracted_data JSONB NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'PASS', 'FAIL', 'MANUAL_REVIEW'
    judge_reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Semantic Query Cache Table
CREATE TABLE query_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    query_embedding VECTOR(1536),
    cached_response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

```

## **5\. Performance & Optimization Strategies**

* **Firebase Proxy Config:** Single-domain setup configured via firebase.json to route backend API traffic seamlessly:  
* JSON

```

{
  "hosting": {
    "public": "dist",
    "rewrites": [
      { "source": "/api/**", "run": { "serviceId": "backend-api-service", "region": "asia-southeast1" } },
      { "source": "**", "destination": "/index.html" }
    ]
  }
}

```

*   
* **Prompt Caching:** Static system prompts placed at the head of prompt calls to leverage DeepSeek’s discounted input rates.  
* **Dimensionality Reduction:** Set gemini-embedding-2 vector outputs to **1536 dimensions** via Matryoshka Learning to optimize vector indexing and storage in Neon DB.  
* **Cold-Start Elimination:** Static frontend assets are delivered via Firebase Edge CDN instantly; Cloud Run instances scale down to zero when unutilized during non-working hours.

## **6\. Comprehensive Financial Overview**

| Category | Provider / Resource | Description & Expected Volume | Est. Monthly Cost (USD) |
| :---- | :---- | :---- | :---- |
| **Frontend Hosting** | Firebase Hosting | Google Edge CDN (\< 10 GB bandwidth/mo) | **$0.00** *(Free Tier)* |
| **Backend Hosting** | GCP Cloud Run | FastAPI/Express container (\< 2M requests/mo) | **$0.00** *(Free Tier)* |
| **File Storage** | Google Cloud Storage | File/PDF storage bucket (\< 5 GB/mo) | **$0.00** *(Free Tier)* |
| **Secrets & Registry** | GCP Secret Mgr / Artifact Reg | Storing API keys & container images | **$0.00 – $0.10** |
| **Database & Vectors** | **Neon PostgreSQL** | Serverless pgvector \+ relational DB | **$0.00 – $2.50** |
| **OCR & Embeddings** | MiniMax M3 \+ Gemini Embedding 2 | Ingestion parsing & vectorization | **\~$0.65** |
| **Cert Pipeline** | DeepSeek V4 Flash \+ Qwen | \~200 certificate extractions & logic checks | **\~$0.60** |
| **RAG Chatbot LLM** | DeepSeek V4 Flash | \~15,000 queries/mo (with prompt caching) | **\~$2.50 – $4.00** |
| **TOTAL ESTIMATED MONTHLY SPEND** |  | **All GCP Infrastructure \+ Neon DB \+ AI APIs** | **\~$3.75 – $7.85 / month** |

