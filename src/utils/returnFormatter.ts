import { ReturnOperator, Properties } from "../services/types";
import { Action } from "../query/types";

function toParts(string: string) {
  return string.split("AS").map((s) => s.trim());
}

export default function returnFormatter<T extends Record<string, Properties>>(
  obj: T,
  returner: ReturnOperator["return"]
): T {
  const results = {};

  /**
   * Gather the return values by their key or alias. e.g
   * initial return object would contain
   * {u: {...}, b: {...}, r: {...}} before grouping.
   * After grouping, it would look like this:
   * {name: ..., u: {...}} etc.
   */

  returner.forEach((key) => {
    let as: string;
    let variable = key as string | Action;

    if (Array.isArray(key)) {
      variable = key[0] as string;
      as = key[key.length - 1] as string;
    }

    if (typeof variable === "string") {
      const [value, alias] = toParts(variable);
      const [main, target] = value.split(".");
      if (alias) as = alias;

      const object = obj[main];

      if (target && Array.isArray(object)) {
        const res = object.map((o) => o[target]);
        results[as ?? variable] = res;
      } else {
        results[as ?? variable] = target ? object[target] : object;
      }
    } else {
      results[as ?? variable.string()] = variable.exec(obj);
    }
  });

  return results as T;
}
