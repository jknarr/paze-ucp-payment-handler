import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
const root = "schemas/2026-07-11";
const handler = read(`${root}/handler.schema.json`);
const businessConfig = read(`${root}/types/business_config.json`);
const platformConfig = read(`${root}/types/platform_config.json`);
const responseConfig = read(`${root}/types/response_config.json`);
const instrument = read(`${root}/types/paze_instrument.json`);
const credential = read(`${root}/types/paze_credential.json`);
const businessExample = read("examples/business-handler.json");
const platformExample = read("examples/platform-handler.json");
const canonicalSchemaBase =
  "https://raw.githubusercontent.com/jknarr/paze-ucp-payment-handler/v2026-07-11/schemas/2026-07-11";

assert.equal(handler.name, "dev.jknarr.paze_checkout");
assert.equal(handler.version, "2026-07-11");
assert.equal(handler.$id, `${canonicalSchemaBase}/handler.schema.json`);
for (const [name, schema] of Object.entries({
  business_config: businessConfig,
  platform_config: platformConfig,
  response_config: responseConfig,
  paze_instrument: instrument,
  paze_credential: credential,
})) {
  assert.equal(schema.$id, `${canonicalSchemaBase}/types/${name}.json`);
}
const variants = handler.$defs["dev.jknarr.paze_checkout"];
for (const variant of ["business_schema", "platform_schema", "response_schema"]) {
  assert.ok(variants[variant], `missing ${variant}`);
  assert.match(
    JSON.stringify(variants[variant]),
    /https:\/\/ucp\.dev\/2026-04-08\/schemas\/payment_handler\.json/,
  );
}

assert.deepEqual(businessConfig.required, ["environment", "client_id"]);
assert.deepEqual(platformConfig.required, ["environment", "module_url"]);
assert.deepEqual(responseConfig.required, ["environment", "client_id"]);
assert.match(
  JSON.stringify(instrument.allOf),
  /2026-04-08\/schemas\/shopping\/types\/payment_instrument\.json/,
);
assert.match(
  JSON.stringify(instrument.properties.display.properties.shipping_address),
  /2026-04-08\/schemas\/shopping\/types\/postal_address\.json/,
);
assert.match(
  JSON.stringify(credential.allOf),
  /2026-04-08\/schemas\/shopping\/types\/payment_credential\.json/,
);
assert.ok(credential.required.includes("expiry"));
assert.equal(credential.properties.type.const, "paze_encrypted_payload");
assert.equal(instrument.properties.type.const, "paze");

for (const example of [businessExample, platformExample]) {
  const declaration = example["dev.jknarr.paze_checkout"][0];
  assert.equal(declaration.version, "2026-07-11");
  assert.match(declaration.schema, /v2026-07-11\/schemas\/2026-07-11\/handler\.schema\.json$/);
  assert.doesNotMatch(declaration.schema, /\/main\//);
  assert.doesNotMatch(declaration.spec, /\/main\//);
}

console.log("Paze handler schema conformance checks passed");
