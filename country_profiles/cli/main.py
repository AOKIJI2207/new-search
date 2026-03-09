import argparse
from pathlib import Path
from ..config_loader import load_config
from ..pipeline import update_all, update_country, diff_country, load_countries, profile_path
from ..utils.io import read_json, ensure_dir
from ..generation.render import profile_to_markdown, markdown_to_html, write_simple_pdf


def generate_country(country: str, cfg: dict):
    profile = read_json(profile_path(country), default=None)
    if not profile:
        raise ValueError(f"Profile missing for {country}. Run update first.")
    slug = country.lower().replace(" ", "_")
    out_dir = ensure_dir(Path(cfg["exports_dir"]) / slug)
    md = profile_to_markdown(profile, "country_profiles/templates/profile_template.md.j2")
    (out_dir / "profile.md").write_text(md, encoding="utf-8")
    html = markdown_to_html(md, f"Fiche pays {country}")
    (out_dir / "profile.html").write_text(html, encoding="utf-8")
    write_simple_pdf(out_dir / "profile.pdf", md)


def generate_all(cfg: dict):
    for c in load_countries():
        p = profile_path(c["name"])
        if p.exists():
            generate_country(c["name"], cfg)


def update_modified_and_generate(cfg: dict):
    modified = update_all(cfg)
    for country in modified:
        generate_country(country, cfg)
    print(f"Modified countries: {len(modified)}")


def main():
    parser = argparse.ArgumentParser(prog="country_profiles")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("update_all_countries")

    p_uc = sub.add_parser("update_country")
    p_uc.add_argument("--country", required=True)

    sub.add_parser("generate_all_profiles")

    p_gc = sub.add_parser("generate_country_profile")
    p_gc.add_argument("--country", required=True)

    p_df = sub.add_parser("diff_country_profile")
    p_df.add_argument("--country", required=True)

    sub.add_parser("regenerate_modified_profiles")

    args = parser.parse_args()
    cfg = load_config()

    if args.cmd == "update_all_countries":
        modified = update_all(cfg)
        print(f"Updated countries: {len(modified)}")
    elif args.cmd == "update_country":
        update_country(args.country, cfg)
        print(f"Updated {args.country}")
    elif args.cmd == "generate_all_profiles":
        generate_all(cfg)
        print("Generated all profiles")
    elif args.cmd == "generate_country_profile":
        generate_country(args.country, cfg)
        print(f"Generated {args.country}")
    elif args.cmd == "diff_country_profile":
        print(diff_country(args.country, cfg))
    elif args.cmd == "regenerate_modified_profiles":
        update_modified_and_generate(cfg)


if __name__ == "__main__":
    main()
