# Chinese-first term normalization

Turn Chinese input into the English term a practitioner would actually search for, see in an editor, or use with teammates. Do not translate mechanically.

## Classify the source concept

Decide which form the input represents before naming the record:

- **Canonical concept**: use the established English term, such as `材质实例` -> `Material Instance`.
- **Product or UI label**: use the official capitalization shown by Unreal Engine or the relevant tool, such as `蓝图接口` -> `Blueprint Interface`.
- **Code or profiler identifier**: preserve the exact identifier in `term`; explain its readable form with `spokenForm`.
- **Symptom or observation**: select the English word that matches the cause and behavior instead of treating all Chinese synonyms as equivalent.
- **Sentence or experience note**: extract one record per learnable concept and keep the full diagnostic statement in `contexts` or `usageNotes`.

Prefer official documentation, editor labels, source identifiers, and established domain usage in that order. Do not translate product names, class names, function names, acronyms, or branded systems into invented English.

## Resolve context-sensitive Chinese

Use nearby evidence to select the sense:

| Chinese input | Use | Distinction |
| --- | --- | --- |
| 主线程 | `Game Thread` in UE gameplay execution; otherwise `Main Thread` | Do not assume they are interchangeable outside UE. |
| 卡顿 | `hitch`, `stutter`, `stall`, `lag`, or `jank` | `hitch`: isolated long frame; `stutter`: repeated uneven frames; `stall`: work stops while waiting; `lag`: delayed network/input response; `jank`: uneven UI animation. |
| 穿模 | `clipping`, `penetration`, or `tunneling` | `clipping`: visible intersection; `penetration`: overlapping collision bodies; `tunneling`: a fast body passes through because collision was missed. |
| 掉帧 | `frame drop` | Use `low frame rate` for sustained low FPS rather than dropped individual frames. |
| 闪退 | `crash to desktop` or `CTD` | Use `crash` when returning to the desktop is not part of the observation. |
| 内存泄漏 | `memory leak` | Do not replace it with general high memory usage. |

When one sense clearly dominates, proceed and explain the boundary in `usageNotes` when useful. When two senses remain equally plausible and would produce different terms, ask for the missing context.

## Map evidence into the record

- `term`: canonical English term or exact code/UI identifier.
- `zh`: short canonical Chinese label, not the entire source sentence.
- `definition`: explain the selected sense and relevant boundary in plain Chinese.
- `ipa`: include only verified or highly reliable IPA for ordinary English.
- `spokenForm`: provide a readable pronunciation form for identifiers, acronyms, or CamelCase names.
- `aliases`: include established abbreviations, alternate English spellings, or official UI/code variants. Avoid long Chinese sentences.
- `tags`: include useful Chinese source words, English retrieval terms, product names, and domain terms.
- `example` and `exampleZh`: demonstrate the same intended sense in a natural work situation.
- `relatedTerms`: add only useful semantic, pipeline, contrast, or cause-effect relationships.
- `contexts`: preserve a source phrase, tool location, workflow, or diagnostic experience when it adds meaning.
- `usageNotes`: record practical distinctions, common confusions, or translation boundaries.
- `source`: identify the file, screenshot, user note, or product context when known.

## Deduplicate before adding

1. Normalize case, spaces, punctuation, CamelCase separators, and common abbreviations.
2. Search `term`, `spokenForm`, `aliases`, `zh`, and `tags` in both built-in and imported records.
3. Treat an exact English identity as a strong match.
4. Treat an exact Chinese label as a candidate only; confirm that domain and sense match.
5. Enrich an existing imported record when it represents the same concept. Do not create a second record merely because the user's Chinese wording differs.

## Quality check

Before merging, confirm that:

- the English is standard for the inferred domain;
- capitalization and acronym spelling match official usage;
- the Chinese meaning is concise and the definition explains the correct sense;
- pronunciation is available through `ipa`, `spokenForm`, or the term itself without invented IPA;
- the example is natural and its translation is aligned;
- tags contain both Chinese and English retrieval paths;
- ambiguous neighboring concepts are separated or explained;
- no semantically equivalent record already exists.
