import type { Query } from "../../query/types";
import { relationStoreName } from "../../utils/utils";
import type { MatchOperators } from "../types";
import { sortAscendingBy, sortDescendingBy } from "../utils/matchSorter";
import returnFormatter from "../utils/returnFormatter";
import { getProps, getStores } from "../utils/utils";
import type { MercuryRecord } from "./../../types";
import type { Properties } from "./../types";
import type { MatchResult } from "./types";
import {
  hasEqualCorrespondence,
  indexStore,
  openCursor,
  updateAndOrDelete,
} from "./utils";

const orderFns = {
  ASC: sortAscendingBy,
  DESC: sortDescendingBy,
};

export default async function match(
  db: IDBDatabase,
  query: Query<string>,
  operators: MatchOperators = {}
): Promise<MercuryRecord<Properties>[] | undefined> {
  const {
    set,
    skip,
    limit,
    where,
    orderBy,
    rawLimit,
    delete: deleter,
    return: returner,
  } = operators;

  const { end, start, relationship } = query;

  // End nodes that are found in the db.
  const foundEnds = new Map();

  // Start nodes that are found in the db.
  const foundStarts = new Map();

  const endProps = end?.props;
  const startProps = start.props;
  const relationProps = relationship?.props;

  const stores = getStores(start.label, end?.label, relationStoreName);
  const tx = db.transaction(stores, "readwrite");

  const setOrDelete = (label: string | undefined) => {
    return (
      (label && label in (set ?? {})) || (label && deleter?.includes(label))
    );
  };

  // Evaluates the where query caluse, if not
  // provided, then all matches are true.
  const whereEval = (...args: Properties[]) => {
    return where ? where(...args) : true;
  };

  let results: MatchResult[] = [];
  const startStore = tx.objectStore(start.label);
  const [store, keyRange] = indexStore(startStore, startProps);

  tx.onerror = () => {
    throw tx.error;
  };

  tx.onabort = () => {
    throw tx.error;
  };

  const relationStore = tx.objectStore(relationStoreName).index("type");

  await openCursor({
    skip,
    store,
    keyRange,
    limit: rawLimit,
    onNext({ value }) {
      if (hasEqualCorrespondence(startProps, value)) {
        foundStarts.set(value._id, value);
      }
    },
  });

  if (end?.label) {
    const endStore = tx.objectStore(end.label);
    const [store, keyRange] = indexStore(endStore, endProps);

    await openCursor({
      skip,
      store,
      keyRange,
      limit: rawLimit,
      onNext({ value }) {
        if (hasEqualCorrespondence(endProps, value)) {
          foundEnds.set(value._id, value);
        }
      },
    });
  }

  if (relationship?.type) {
    const keyRange = IDBKeyRange.only(relationship.type);

    // Not sure if I should also apply skipping
    // to the relatinship store. But I think not.
    await openCursor({
      //   skip,
      keyRange,
      store: relationStore,
      onNext(cursor) {
        const { value } = cursor;
        const { _id, type } = value;
        const props = getProps(value) ?? {};

        if (hasEqualCorrespondence(relationProps, props)) {
          const result = {} as MatchResult;
          const startNode = foundStarts.get(value.start);

          if (startNode) {
            let relation = { _id, type, ...props };
            const endNode = foundEnds.get(value.end);

            const args = [
              start.as && startNode,
              relationship.as && relation,
              end?.as && endNode,
            ].filter((arg) => !!arg);

            const matches = whereEval(...args);

            if (matches) {
              const relationMatch = endProps
                ? value.end &&
                  endNode &&
                  value.start === startNode._id &&
                  value.end === endNode._id
                : true;

              if (relationMatch) {
                const { as } = relationship;

                if (setOrDelete(as)) {
                  if (set) {
                    const setter = set[as].exec(props);
                    relation = { ...relation, ...setter };
                    cursor.update({ ...value, ...relation });
                  }

                  if (deleter && deleter.includes(as)) {
                    cursor.delete();
                  }
                }

                result[as] = relation;
                result[start.as] = startNode;
                if (end?.as) result[end.as] = endNode;

                results.push(result);
              }
            } else {
              foundEnds.delete(value.end);
              foundStarts.delete(value.start);
            }
          }
        }
      },
    });
  } else {
    const entries = foundStarts.entries();

    for (const [key, value] of entries) {
      const matches = whereEval(value);

      if (matches) {
        results.push({ [start.as]: value });
      } else {
        foundStarts.delete(key);
      }
    }
  }

  // Perform neccessary property updates or
  // store item deletion.
  if (set || deleter) {
    if (setOrDelete(start.as)) {
      await updateAndOrDelete({
        set,
        relationStore,
        label: start.as,
        delete: deleter,
        ref: foundStarts,
        store: startStore,
      });
    }

    if (setOrDelete(end?.as)) {
      if (end?.label) {
        const endStore = tx.objectStore(end.label);
        await updateAndOrDelete({
          set,
          relationStore,
          label: end.as,
          ref: foundEnds,
          delete: deleter,
          store: endStore,
        });
      }
    }

    // Assign the new updates to the output
    results = results.map((result) => {
      for (const key in result) {
        const value = result[key];
        const assigner = set?.[key];

        if (assigner) {
          const setter = assigner.exec(value);
          result[key] = { ...value, ...setter };
        }
      }

      return result;
    });
  }

  if (!returner) return;

  if (limit) results.length = limit;

  if (orderBy) {
    const { key, type = "ASC" } = orderBy;
    const orderFn = orderFns[type];
    const keys = Array.isArray(key) ? key : [key];
    for (const key of keys)
      results = orderFn(results as MatchResult<string | number>[], key);
  }

  return results.map((result) => {
    return returnFormatter(result, returner);
  });
}
