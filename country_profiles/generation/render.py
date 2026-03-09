from pathlib import Path
from html import escape


def _list(items):
    return "\n".join(f"- {i}" for i in items)


def _dict_lines(d):
    return "\n".join(f"- {k}: {v}" for k, v in d.items())


def profile_to_markdown(profile: dict, template_path: str) -> str:
    template = Path(template_path).read_text(encoding="utf-8")
    payload = {
        **profile,
        "main_risks": _list(profile["main_risks"]),
        "key_data": _dict_lines(profile["key_data"]),
        "risk_zones": _list(profile["risk_zones"]),
        "next_milestones": _list(profile["next_milestones"]),
        "category_analysis": _dict_lines(profile["category_analysis"]),
        "best_practices": _dict_lines(profile["best_practices"]),
        "important_dates": _list(profile["important_dates"]),
        "zone_analysis": _dict_lines(profile["zone_analysis"]),
    }
    # tiny placeholder renderer
    for k, v in payload.items():
        if isinstance(v, dict):
            for dk, dv in v.items():
                template = template.replace("{{" + k + "." + dk + "}}", str(dv))
        else:
            template = template.replace("{{" + k + "}}", str(v))
    return template


def markdown_to_html(md: str, title: str) -> str:
    lines = []
    for line in md.splitlines():
        if line.startswith("# "):
            lines.append(f"<h1>{escape(line[2:])}</h1>")
        elif line.startswith("## "):
            lines.append(f"<h2>{escape(line[3:])}</h2>")
        elif line.startswith("- "):
            lines.append(f"<li>{escape(line[2:])}</li>")
        elif line.strip() == "":
            lines.append("")
        else:
            lines.append(f"<p>{escape(line)}</p>")
    body = "\n".join(lines)
    return f"<!doctype html><html><head><meta charset='utf-8'><title>{escape(title)}</title></head><body>{body}</body></html>"


def write_simple_pdf(path: str | Path, text: str) -> None:
    # Minimal single-font PDF writer for portability (no external dependency)
    safe = text.replace("(", "[").replace(")", "]")
    safe = safe.encode("latin-1", "replace").decode("latin-1")
    content = "BT /F1 10 Tf 50 780 Td (" + safe[:3000].replace("\n", ") Tj T* (") + ") Tj ET"
    objects = []
    objects.append("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj")
    objects.append("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj")
    objects.append("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj")
    objects.append("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj")
    objects.append(f"5 0 obj << /Length {len(content)} >> stream\n{content}\nendstream endobj")
    pdf = "%PDF-1.4\n"
    offsets = []
    for obj in objects:
        offsets.append(len(pdf.encode("latin-1")))
        pdf += obj + "\n"
    xref_pos = len(pdf.encode("latin-1"))
    pdf += f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n"
    for off in offsets:
        pdf += f"{off:010d} 00000 n \n"
    pdf += f"trailer << /Root 1 0 R /Size {len(objects)+1} >>\nstartxref\n{xref_pos}\n%%EOF"
    Path(path).write_bytes(pdf.encode("latin-1", errors="ignore"))
