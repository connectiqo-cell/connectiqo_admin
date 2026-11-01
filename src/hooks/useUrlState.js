import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/** What a table page (ResourceCrudPage) keeps in the address; cleared when switching tables. */
export const RESOURCE_URL_KEYS = ["q", "page", "size", "sort", "dir", "filters"];

const currentParams = () => new URLSearchParams(window.location.search);
const identity = (value) => value;

function readValue(text, defaultValue, parse, allowed) {
  if (text === null) return defaultValue;
  const parsed = parse(text);
  return parsed === undefined || (allowed && !allowed.includes(parsed)) ? defaultValue : parsed;
}

function useReplaceParams() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  return useCallback((params) => {
    const search = params.toString();
    navigateRef.current(
      { search: search ? `?${search}` : "" },
      { replace: true, preventScrollReset: true, state: window.history.state?.usr }
    );
  }, []);
}

/**
 * useState that also lives in the web address, so a refresh, the back button or a shared link
 * keeps the view. Default values stay out of the address, and anything invalid in it is ignored.
 *
 * The router applies address changes in a low-priority update, which would make a text box lag
 * behind typing. So the value is kept in local state too, and always re-read from the real address.
 * The address itself changes straight away, so two setters in one click both apply.
 *
 * Pass `parse`, `serialize` and `defaultValue` as stable values for non-text settings.
 */
export function useUrlState(key, defaultValue, { parse = identity, serialize = String, allowed } = {}) {
  const [params] = useSearchParams();
  const addressValue = params.get(key);
  const [raw, setRaw] = useState(addressValue);
  const replaceParams = useReplaceParams();

  useEffect(() => {
    setRaw(currentParams().get(key));
  }, [key, addressValue]);

  const value = useMemo(() => readValue(raw, defaultValue, parse, allowed), [raw, defaultValue, parse, allowed]);

  // Keeps the setter the same between renders, even when `allowed` is written inline.
  const options = useRef(null);
  useEffect(() => {
    options.current = { defaultValue, parse, serialize, allowed };
  });

  const setValue = useCallback(
    (next) => {
      const { defaultValue: fallback, parse: toValue, serialize: toText, allowed: valid } = options.current;
      const latest = currentParams();
      const resolved = typeof next === "function" ? next(readValue(latest.get(key), fallback, toValue, valid)) : next;
      const isDefault = resolved === null || resolved === undefined || resolved === "" || toText(resolved) === toText(fallback);
      const text = isDefault ? null : toText(resolved);
      setRaw(text);
      if (text === null) latest.delete(key);
      else latest.set(key, text);
      replaceParams(latest);
    },
    [key, replaceParams]
  );

  return [value, setValue];
}

const parseWholeNumber = (text) => {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
};

/** A page number, page size and so on: a whole number from 1 up. */
export function useUrlNumber(key, defaultValue) {
  return useUrlState(key, defaultValue, { parse: parseWholeNumber });
}

/** Removes settings from the address, for example when switching to a different table. */
export function useClearUrlKeys() {
  const replaceParams = useReplaceParams();
  return useCallback(
    (keys) => {
      const latest = currentParams();
      keys.forEach((key) => latest.delete(key));
      replaceParams(latest);
    },
    [replaceParams]
  );
}

/**
 * Runs `callback` when `deps` change, but not when the page opens. Used to go back to page 1
 * after a filter changes, without losing the page number from a refresh or shared link.
 */
export function useOnChange(callback, deps) {
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    callback();
    // The caller's deps decide when this runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
