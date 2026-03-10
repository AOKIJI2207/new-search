import argparse
from collections import Counter
from pathlib import Path
from ..config_loader import load_config
from ..pipeline import update_all, update_country, diff_country, load_countries, profile_path
from ..utils.io import read_json, ensure_dir
from ..generation.render import profile_to_markdown, markdown_to_html, write_simple_pdf
from ..data.schema import validate_catalog, validate_profile


def generate_country(country: str, cfg: dict):
    profile = read_json(profile_path(country), default=None)
    if not profile:
        raise ValueError(f"Profile missing for {country}. Run update first.")
    slug = profile["country_id"].lower()
    out_dir = ensure_dir(Path(cfg["exports_dir"]) / slug)
    md = profile_to_markdown(profile, "country_profiles/templates/profile_template.md.j2")
    (out_dir / "profile.md").write_text(md, encoding="utf-8")
    html = markdown_to_html(md, f"Fiche pays {country}")
    (out_dir / "profile.html").write_text(html, encoding="utf-8")
    write_simple_pdf(out_dir / "profile.pdf", md)


def generate_all(cfg: dict):
    for c in load_countries():
        p = profile_path(c["iso3"])
        if p.exists():
            generate_country(c["iso3"], cfg)


def update_modified_and_generate(cfg: dict):
    modified = update_all(cfg)
    for country in modified:
        generate_country(country, cfg)
    print(f"Modified countries: {len(modified)}")


def validate_dataset():
    countries = load_countries()
    catalog_errors = validate_catalog(countries)
    profiles_dir = Path("country_profiles/data/profiles")
    profile_files = sorted(profiles_dir.glob("*.json"))
    index = {country["iso3"]: country for country in countries}
    profile_errors = []

    if len(profile_files) != len(countries):
        profile_errors.append(f"profile_count:{len(profile_files)}")

    for path in profile_files:
        profile = read_json(path)
        iso3 = path.stem
        country = index.get(iso3)
        if not country:
            profile_errors.append(f"orphan_profile:{iso3}")
            continue
        profile_errors.extend(validate_profile(profile, country))

    continents = Counter(country["continent"] for country in countries)
    return {
        "valid": not catalog_errors and not profile_errors,
        "catalog_errors": catalog_errors,
        "profile_errors": profile_errors,
        "country_count": len(countries),
        "profile_count": len(profile_files),
        "continents": dict(continents),
    }


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
    sub.add_parser("validate_dataset")

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
    elif args.cmd == "validate_dataset":
        print(validate_dataset())


if __name__ == "__main__":
    main()
