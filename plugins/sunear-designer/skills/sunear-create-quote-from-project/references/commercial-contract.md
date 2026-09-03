# Sunear Commercial Contract

## Domain owners

The organization product schema revision owns the shared field definitions, order, value types, and required/optional/disabled policy.

A published product directory revision owns concrete sellable products, product kind, allowed configuration options and defaults, catalog facts, product media, and evidence. It does not own currency, market terms, or price formulas.

A published price-book revision owns concrete product bindings, ordered pricing conditions, formulas, pricing units, currency, and named base rate inputs. Conditions may consume typed configuration values and Engine facts. Formulas may consume numeric Engine facts and named rate inputs. Labels, prompts, array order, cached previews, and historical totals are never pricing facts.

A published market revision:

- pins exact product-directory and price-book revisions;
- selects concrete sellable products;
- supplies defaults only from each product's allowed options;
- may override named price-book rate amounts in the price-book currency;
- cannot alter catalog facts, product scope outside its published selection, formulas, pricing units, Engine topology, profile/performance facts, or evidence;
- publishes an immutable effective-price snapshot consumed by the project quotation.

## Engine boundary

Engine v3 owns design topology, opening/mechanism facts, dimensions, drawing projection, and derived quantity facts such as area, glass area, sash count, member length, hardware count, or track count. The price book may reference only typed facts exported by the Engine-to-commercial contract. A missing fact blocks matching or calculation; product names and drawing appearance cannot replace it.

## Revision and priority rules

- Published organization schema, product directory, price book, market, and effective-price revisions are immutable.
- Never resolve an unqualified "latest" revision for an existing project or quotation.
- Product-directory allowed/default options precede market defaults; explicit compatible project selections are preserved by market application.
- Market application uses the project revision and market fingerprint returned by `list_project_markets`. These values are concurrency evidence, not agent-generated metadata.
- Formula branches are price-book decisions. A market cannot change branch structure, conditions, formula semantics, or units.
- A quote total and translated document are derived outputs of the frozen commercial revision, never sources of pricing truth.
