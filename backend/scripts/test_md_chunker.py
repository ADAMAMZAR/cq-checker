"""Test script for Markdown smart chunker."""

import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.chunker import chunk_markdown_document

def test_faq_chunking():
    faq_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../Ariba_FAQ_Reference.md"))
    if not os.path.exists(faq_path):
        print(f"File not found: {faq_path}")
        return

    with open(faq_path, "r", encoding="utf-8") as f:
        content = f.read()

    chunks = chunk_markdown_document(content)
    print(f"--- FAQ Reference Chunking ---")
    print(f"Total Chunks Generated: {len(chunks)}")
    print(f"Sample Chunk 1 (BU-Q1):\n{repr(chunks[0]['content'][:150])}...")
    print(f"Sample Chunk 2 (BU-Q2):\n{repr(chunks[1]['content'][:150])}...")
    print("--------------------------------\n")

def test_process_chunking():
    process_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../Ariba Process 26-0401.md"))
    if not os.path.exists(process_path):
        print(f"File not found: {process_path}")
        return

    with open(process_path, "r", encoding="utf-8") as f:
        content = f.read()

    chunks = chunk_markdown_document(content)
    print(f"--- Ariba Process 26-0401 Chunking ---")
    print(f"Total Chunks Generated: {len(chunks)}")
    for i, c in enumerate(chunks, 1):
        has_mermaid = "```mermaid" in c['content']
        has_steps = "1. **Step 1:**" in c['content']
        print(f"Chunk {i}: length={len(c['content'])} chars | has_mermaid={has_mermaid} | has_steps={has_steps}")
        print(f"Preview:\n{c['content'][:120]}...\n")
    print("--------------------------------\n")

if __name__ == "__main__":
    test_faq_chunking()
    test_process_chunking()
