# Door And Window Recognition

## Evidence classes

Record visible facts as observed. Record a domain conclusion as inferred only when its geometric rule and crop evidence are explicit. Use ambiguous when multiple interpretations remain possible and conflicting when visible sources disagree. Do not turn either state into an Engine default.

## Topology

- Identify the frame boundary before internal structure.
- Before interpreting any internal line, classify it as frame boundary, sash boundary, structural member, opening guide, hardware, track/interlock, grille, or unrelated page geometry. Record ambiguous classifications instead of choosing the class that makes a template compile.
- Model mullions and transoms as structural members owned by the relevant frame, region, or sash. Do not infer their owner from drawing order.
- Distinguish direct glazing, a fixed sash, and an opening sash. Similar rectangles do not make them equivalent.
- Preserve nested ownership: a sash-internal member is not a frame member, and its child glazing belongs to that sash.
- Represent paired, sliding, folding, or coupled sashes with explicit semantic group membership and mechanism facts from the live `DesignIntent` contract. Array position is never group identity.
- Absence of opening diagonals does not prove a fixed product. A center gap or overlapping rectangle is a sliding candidate, not a conclusion; reconcile it with handles, track/interlock or movement evidence, plans, elevations, schedules, and notes.
- Sliding requires visible or explicit track, interlock, or movement evidence. Do not infer it from dimensions, item numbers, wide proportions, or repeated panes.
- Repeated rectangles and grid-like lines may be sash/frame profiles, structural divisions, glazing bars, background cladding, or table geometry. Do not create Engine grilles unless a dedicated grille classification is supported across the item crop and related views.

## Opening evidence

Treat mechanism, hinge/pivot side, handle side, opening-line direction, swing, and viewed side as separate facts.

- For a casement, opening guide lines conventionally start at hinge points and converge toward the handle side. Confirm against visible handle or hinge marks whenever present.
- Tilt-turn requires evidence for both the side-hung turn and bottom-fixed inward tilt. A single triangular guide is not enough.
- Awning, bottom-hung, pivot, sliding, folding, and slide-and-swing products require their own visible mechanism evidence.
- A source crop owns handle position and opening-line direction. Renderer defaults and template defaults are not evidence.
- If a casement family and sash ownership are supported but hinge side, handle side, swing, or viewed side is omitted, still produce an editable draft. Prefer handle evidence, repeated types, related views, and declared project or exact-product defaults. If none exists, apply the documented provisional design default, record each filled field as inferred, and keep the field traceable in revision review; never describe it as observed. Stop only when the mechanism family or sash ownership is unknown, or sources conflict.
- If viewed side is uncertain, preserve that uncertainty without discarding supported topology or dimensions.

## Review checklist

Compare source evidence with the regenerated Engine drawing for:

- overall and chained dimensions;
- count, orientation, position, continuity, and ownership of members;
- fixed versus opening regions;
- sash count, nesting, and group connections;
- opening mechanism and movement direction;
- handle, hinge, lock, and track marks;
- opening lines/arrows and viewed side;
- glass/fill and grille ownership.

For each item, explicitly record whether the primary crop contains exactly one product and whether the inspected raster's long edge is at least 1200 pixels. Then compare each classified source line with the regenerated Engine owner. A line that exists only in the source or only in Engine is a mismatch until it is explained as unrelated page geometry.

Any mismatch changes upstream evidence or semantic `DesignIntent` facts and produces a new Engine revision. Never patch only the compiled action history, SVG, thumbnail, cached preview, or renderer output.

## Recognition case retrieval

- Search reviewed organization cases only after current evidence is low-confidence, conflicting, or rejected by validation. Query by anomaly class and evidence tags, not by display-name similarity alone.
- Apply the retrieved decision basis only as an inspection checklist. Current item pixels, associated schedules/elevations, stable identity, and Engine validation remain authoritative.
- After repairing the project, nominate a case only when its anomaly is novel relative to reviewed results. Reference the existing project-owned high-resolution crop; do not duplicate the PDF or raster bytes.
- A nomination is candidate-only and non-blocking. A different Agent work binding must independently reinspect the source and validate the regenerated Engine design before the case becomes reviewed.
