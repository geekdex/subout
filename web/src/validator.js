import Ajv from "ajv";
import { token, API_BASE } from "./store.js";

let ajv = null;
export const validators = {};

export async function initAjv() {
  if (ajv) return;
  try {
    const res = await fetch(`${API_BASE}/api/config/schemas`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const schemas = await res.json();
      ajv = new Ajv({ allErrors: true, strict: false });

      if (schemas.log) validators["log"] = ajv.compile(schemas.log);
      if (schemas.dns) validators["dns"] = ajv.compile(schemas.dns);
      if (schemas.inbounds)
        validators["inbounds"] = ajv.compile(schemas.inbounds);
      if (schemas.route) validators["route"] = ajv.compile(schemas.route);
      if (schemas.experimental)
        validators["experimental"] = ajv.compile(schemas.experimental);
      if (schemas.node) validators["node"] = ajv.compile(schemas.node);

      if (
        schemas.dns &&
        schemas.dns.properties &&
        schemas.dns.properties.servers
      ) {
        validators["dns_server"] = ajv.compile(
          schemas.dns.properties.servers.items || {},
        );
      }
      if (
        schemas.dns &&
        schemas.dns.properties &&
        schemas.dns.properties.rules
      ) {
        validators["dns_rule"] = ajv.compile(
          schemas.dns.properties.rules.items || {},
        );
      }
      if (schemas.inbounds) {
        validators["inbound"] = ajv.compile(schemas.inbounds.items || {});
      }
      if (
        schemas.route &&
        schemas.route.properties &&
        schemas.route.properties.rules
      ) {
        validators["route_rule"] = ajv.compile(
          schemas.route.properties.rules.items || {},
        );
      }
      if (
        schemas.route &&
        schemas.route.properties &&
        schemas.route.properties.rule_set
      ) {
        validators["route_ruleset"] = ajv.compile(
          schemas.route.properties.rule_set.items || {},
        );
      }
      console.log("[Ajv] Unified validation schemas compiled successfully");
    }
  } catch (e) {
    console.error("[Ajv] Failed to load config schemas", e);
  }
}

export function validateData(key, data) {
  if (!validators[key]) return { valid: true };
  const valid = validators[key](data);
  if (!valid) {
    const errors = validators[key].errors
      .map((err) => {
        const field = err.instancePath ? `字段 '${err.instancePath}' ` : "";
        return `${field}${err.message}`;
      })
      .join("; ");
    return { valid: false, errors };
  }
  return { valid: true };
}
