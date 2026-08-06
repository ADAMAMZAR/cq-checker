"""CLI Smoke Test Script for Docling Parser Service.

Parses input files (PDF, image, DOCX, XLSX) and saves the generated structured markdown to a .md file.

Usage:
    python -m scripts.dev_parse_sample <path_to_file> [max_pages] [out_path]

Example:
    python -m scripts.dev_parse_sample "../test/WGAVIC P-L - 260622 WGASS in Relation to Workers Compensation.pdf"
"""

import sys
import os
import time
from app.services import docling_parser


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.dev_parse_sample <path_to_file> [max_pages] [out_path]")
        sys.exit(1)

    filepath = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 20

    if not os.path.exists(filepath):
        print(f"Error: File not found at '{filepath}'")
        sys.exit(1)

    filename = os.path.basename(filepath)
    ext = os.path.splitext(filename)[1].lower()
    base_name = os.path.splitext(filename)[0]

    # Determine output .md file path
    if len(sys.argv) > 3:
        out_path = sys.argv[3]
    else:
        file_dir = os.path.dirname(filepath) or "."
        out_dir = os.path.join(file_dir, "output")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{base_name}.md")

    mime_type_map = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    mime_type = mime_type_map.get(ext, "application/octet-stream")

    print("=" * 60)
    print(f"  Docling Parsing Smoke Test")
    print("=" * 60)
    print(f"Input File : {filepath}")
    print(f"MIME Type  : {mime_type}")

    with open(filepath, "rb") as f:
        file_bytes = f.read()

    start_time = time.time()
    pages, cost, meta = docling_parser.parse_to_markdown(
        file_bytes, mime_type=mime_type, filename=filename, max_pages=max_pages
    )
    elapsed = time.time() - start_time

    # Build combined markdown document
    md_content_lines = [
        f"# Docling Parsed Output: {filename}\n",
        f"- **Pages Processed**: {meta['page_count']}",
        f"- **Parsing Duration**: {elapsed:.2f} seconds",
        f"- **Cost**: ${cost:.4f}\n",
        "---\n",
    ]

    for p in pages:
        md_content_lines.append(f"## Page {p['page_number']}\n")
        md_content_lines.append(p["markdown"])
        md_content_lines.append("\n\n---\n")

    full_md_output = "\n".join(md_content_lines)

    # Save to .md output file
    abs_out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(abs_out_path), exist_ok=True)
    with open(abs_out_path, "w", encoding="utf-8") as out_f:
        out_f.write(full_md_output)

    print("-" * 60)
    print(f"SUCCESS: Parsing completed in {elapsed:.2f}s")
    print(f"Total Pages : {meta['page_count']}")
    print(f"Output Saved: {abs_out_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
