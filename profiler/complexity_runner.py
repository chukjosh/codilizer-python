"""
CLI entry point invoked by the extension's `analyzeComplexity` command.

    python complexity_runner.py <file_path> <function_name>

Prints a single JSON line (ComplexityResult shape) to stdout on success,
or a JSON line with an "error" key on failure.

LIMITATION (phase 1): input generation is automatic and only handles the
common case of a function taking one sequence argument (list/str) or one
int argument. Functions with other signatures need a manual profiling
harness — this scaffold intentionally keeps auto-generation simple rather
than guessing arbitrary argument shapes. Input sizes are chosen
adaptively (see complexity_profiler.adaptive_sizes) so exponential- or
factorial-time functions don't hang.
"""
import sys
import json
import importlib.util
import inspect
import random

from complexity_profiler import profile, profile_args


def load_function(file_path, function_name):
    spec = importlib.util.spec_from_file_location("target_module", file_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, function_name):
        raise AttributeError(f"'{function_name}' not found in {file_path}")
    return getattr(module, function_name)


def _unwrap_type(annotation):
    """Unwraps Optional, Union, and generic aliases from typing module."""
    if annotation is inspect.Parameter.empty:
        return None
    origin = getattr(annotation, "__origin__", None)
    # Handle typing.Union and types.UnionType (e.g. int | None)
    if origin is not None and str(origin).endswith("Union"):
        args = getattr(annotation, "__args__", ())
        non_none = [a for a in args if a is not type(None)]
        if non_none:
            return non_none[0]
    return origin or annotation


def make_input_for(param, n):
    """Best-effort single-argument generator based on a parameter's type hint,
    typing annotations (List, Dict, Tuple, Set, Callable, etc.), or name heuristics."""
    annotation = _unwrap_type(param.annotation)

    # Primitive types
    if annotation in (int,):
        return n
    if annotation in (float,):
        return float(n)
    if annotation in (str,):
        return "x" * n
    if annotation in (bool,):
        return True
    if annotation in (bytes, bytearray):
        return b"x" * n
    if annotation in (complex,):
        return complex(n, 1)

    # Collections & Generics
    if annotation in (list, set, frozenset):
        return [random.randint(0, 10_000) for _ in range(n)]
    if annotation in (tuple,):
        return tuple(random.randint(0, 10_000) for _ in range(n))
    if annotation in (dict,):
        return {f"k_{i}": i for i in range(n)}

    name = param.name.lower()
    STR_HINTS = {"text", "string", "s", "str", "word", "sentence", "msg",
                 "message", "name", "line", "char", "chars", "pattern", "filename", "path"}
    INT_HINTS = {"a", "b", "c", "d", "n", "num", "number", "count", "size", "k", "x", "y", "z",
                 "index", "idx", "limit", "value", "val", "amount", "total", "step", "offset",
                 "width", "height", "len", "length", "dist", "distance", "cost", "weight"}
    FLOAT_HINTS = {"celsius", "fahrenheit", "temp", "temperature", "rate", "ratio", "factor",
                   "percent", "price", "score", "avg", "average"}
    DICT_HINTS = {"d", "dict", "map", "mapping", "config", "options", "kwargs", "info", "lookup"}
    SET_HINTS = {"seen", "visited", "unique", "elements_set", "st", "nodes"}
    TUPLE_HINTS = {"point", "coord", "coords", "pair", "triple", "rgb", "dimensions"}
    BOOL_HINTS = {"is_", "has_", "flag", "debug", "reverse", "enable", "disabled"}

    # Heuristic checks when no annotation is provided
    if name in STR_HINTS:
        return "x" * n
    if name in FLOAT_HINTS:
        return float(n)
    if name in INT_HINTS:
        return n
    if name in DICT_HINTS:
        return {f"k_{i}": i for i in range(n)}
    if name in SET_HINTS:
        return set(range(n))
    if name in TUPLE_HINTS:
        return (n, 1)
    if any(name.startswith(p) for p in ("is_", "has_", "should_")) or name in BOOL_HINTS:
        return True

    # Default sequence input (list of ints)
    return [random.randint(0, 10_000) for _ in range(n)]


def make_fixed_arg(param, first_arg_val=None):
    """A stable, size-independent value for parameters after the first."""
    if param.default is not inspect._empty:
        return param.default

    annotation = _unwrap_type(param.annotation)
    if annotation in (int,):
        return 1
    if annotation in (float,):
        return 1.0
    if annotation in (str,):
        return "x"
    if annotation in (bool,):
        return True
    if annotation in (list,):
        return [1]
    if annotation in (dict,):
        return {"key": 1}
    if annotation in (set, frozenset):
        return {1}
    if annotation in (tuple,):
        return (1,)

    name = param.name.lower()
    if name in {"target", "item", "val", "x", "needle", "key", "elem"}:
        # Common search/compare target: if list of ints, search for 1
        return 1
    if name in {"text", "string", "s", "str", "word", "char"}:
        return "x"
    if name in {"dict", "d", "map", "info"}:
        return {"a": 1}
    if name in {"lst", "list", "arr", "nums", "items"}:
        return [1]

    if first_arg_val is not None:
        if isinstance(first_arg_val, list):
            return [1]
        if isinstance(first_arg_val, int):
            return 1
        if isinstance(first_arg_val, float):
            return 1.0
        if isinstance(first_arg_val, str):
            return "x"
        if isinstance(first_arg_val, dict):
            return {"k": 1}

    return 1


def build_call_args(sig, n):
    """Builds positional and keyword argument list for size n."""
    args = []
    first_arg = None
    for i, p in enumerate(sig.parameters.values()):
        if p.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue
        if i == 0:
            first_arg = make_input_for(p, n)
            args.append(first_arg)
        else:
            args.append(make_fixed_arg(p, first_arg_val=first_arg))
    return args


def main():
    if len(sys.argv) != 3:
        print(json.dumps({"error": "usage: complexity_runner.py <file_path> <function_name>"}))
        sys.exit(1)

    file_path, function_name = sys.argv[1], sys.argv[2]

    try:
        func = load_function(file_path, function_name)
        sig = inspect.signature(func)

        if len(sig.parameters) == 0:
            result = profile(lambda _: func(), lambda n: n)
        else:
            # Try our primary argument builder
            try:
                result = profile_args(func, lambda n: build_call_args(sig, n))
            except (TypeError, AttributeError):
                # If list/default inputs caused type incompatibility (e.g. math on unannotated params),
                # try fallback strategies: integer inputs, then string inputs.
                try:
                    result = profile_args(func, lambda n: [n if i == 0 else 1 for i in range(len(sig.parameters))])
                except (TypeError, AttributeError):
                    result = profile_args(func, lambda n: ["x" * n if i == 0 else "x" for i in range(len(sig.parameters))])

        result["functionName"] = function_name
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
