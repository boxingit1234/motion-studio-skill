# Claims, sources and client material

A product film is an ad. Every number in it can be checked by a customer or a competitor. The rule that kept every delivery safe: **if it is not in an official source you can link, it is not on screen.**

## Research order
1. **The manufacturer's official spec / datasheet page** (e.g. the product's `/specs` page on the maker's site). Its footnotes matter: lab conditions, "only with model X", "derated above 2000 m".
2. **The client's own site and files.** Read them critically: resellers often paste spec tables between products, and they contradict each other.
3. **Third-party shops:** only to notice conflicts, never as a source.

## `CLAIMS.md` (one per film)
```
| Time (s) | On-screen text | Source + exact wording | Note |
|---|---|---|---|
| 12.9–17.8 | "Energie utilizabilă 6,9 → 13,8 → 20,7 kWh" | [H] Battery usable energy 1(7) / 2(7+7) / 3(7+7+7) | footnote 1: 100% DoD, 0.2C, 25 °C |
```
Add a section **"What we do NOT say (on purpose)"**:
- conditional numbers ("up to 252 kWh, only with 3 MB0 inverters");
- warranty years that depend on a warranty letter;
- certifications that need exact wording;
- weights or dimensions that sources disagree on;
- prices without a dated proof;
- backup claims that need other equipment.

## Rules
- **Never invent:** metrics, customers, reviews, results, savings percentages, "Nr. 1" claims, or timings ("0 ms") without the source. Hedge with the source's own words ("conform producătorului").
- **Conflicts:** pick neither value. Leave the number out, list the conflict in the delivery note, and let the client decide.
- **Units and formatting:** use the audience's locale (Romanian: `6,9 kWh`, `−20 °C … +55 °C`, thousands with a dot only from 10 000). Keep case-sensitive units exactly (kWh, kW, LiFePO₄, IP66).
- **Prices:** only with the date of the check on screen ("Prețuri verificate pe 10.10.2026") and the client's OK. Comparing against third-party platforms needs explicit approval.
- **Superlatives** ("revoluționar", "cel mai bun") only when the client's own published copy uses them.

## Client material
- Client files (logos, photos, footage, fonts, decks) live in the film's `assets/` and **never** leave that film. Don't reuse one client's assets in another client's film or in templates.
- Some material is confidential even if it was sent to you (certificates, institution names, test data, staff photos). Keep a short `assets/INVENTORY.md` listing what may NOT be shown.
- **Downloads:** ask before downloading files (say the name, source and size). Viewing pages and loading web fonts at render time is browsing, not downloading.
- **Capturing websites:**
  - Decline non-essential cookies.
  - Close sign-in / address sheets without typing.
  - Never click buy, add-to-cart, submit or send.
  - Prefer public pages.

## The delivery note (`CITESTE-MA.md` / `README.md` next to the files)
1. What each file is (format, length, loudness, where to post it).
2. The story in 4–6 lines.
3. Where the facts come from.
4. What the client should confirm before publishing (conflicts found, partner/brand-usage rules, phone numbers or URLs that differ between their channels).
