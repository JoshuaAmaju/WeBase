import { Query } from "../query/types";
import { getStores, has } from "../utils/utils";
import WeBase from "../WeBase";
import create from "./create";
import match from "./match/match";
import { MatchOperators, MergeOperators, Properties } from "./types";

function get(
  tx: IDBTransaction,
  name: string,
  key: string | number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const store = tx.objectStore(name);
    const req = store.get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export default async function merge(
  weBase: WeBase,
  query: Query<string>,
  operators: MergeOperators = {}
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const db = weBase.db;
  const returner = operators.return;
  const { onMatch, onCreate } = operators;
  const { end, start, relationship } = query;

  const newOperators: MatchOperators = {
    return: [end.as, start.as, relationship.as],
  };

  if (onMatch) newOperators.set = { ...onMatch };

  const matchRes = await match(db, query, newOperators);

  if (matchRes && matchRes.length > 0) return matchRes;

  const endProps = end.props as Properties;
  const startProps = start.props as Properties;
  const relationProps = relationship.props as Properties;

  const props = {
    [end.as]: endProps,
    [start.as]: startProps,
    [relationship.as]: relationProps,
  } as unknown;

  if (onCreate) {
    for (const key in onCreate) {
      const prop = props[key];
      props[key] = onCreate[key].exec(prop);
    }
  }

  const stores = getStores(start.label, end.label);
  const tx = db.transaction(stores);

  let newEndProps = {};
  let newStartProps = {};

  /**
   * If the only item in the object is the internal
   * ID (_id), there's no point creating a node that already exist,
   * instead, find the node and merge its values with the new
   * values to avoid empty insertions or overriding existing data
   * in the database with object fields set to undefined.
   */
  if (has.call(startProps, "_id")) {
    newStartProps = await get(tx, start.label, startProps._id);
  }

  if (has.call(endProps, "_id")) {
    newEndProps = await get(tx, end.label, endProps._id);
  }

  // Assign default values to the query props object
  query.relationship.props = props[relationship.as];
  query.end.props = { ...newEndProps, ...props[end.as] };
  query.start.props = { ...newStartProps, ...props[start.as] };

  const createRes = await create(db, query, newOperators);

  if (!returner) return;

  return createRes;
}
