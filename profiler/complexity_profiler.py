"""
Dynamic complexity profiler.

Runs a target function against an adaptively-chosen range of input
sizes, counts executed line hits via sys.settrace, measures peak memory
via tracemalloc, and fits the growth curve to the closest Big-O class
by comparing three regression models (polynomial/log family,
exponential, factorial-ish) and picking whichever fits best.

Run on-demand / in the background, never during live step-debugging
(see architecture notes in areas/codilizer.md).
"""
import sys
import time
import tracemalloc
import gc
import math


def count_line_hits(func, *args, **kwargs):
    hits = {"count": 0}

    def tracer(frame, event, arg):
        if event == "line":
            hits["count"] += 1
        return tracer

    sys.settrace(tracer)
    try:
        func(*args, **kwargs)
    finally:
        sys.settrace(None)
    return hits["count"]


def measure_peak_memory(func, *args, **kwargs):
    """Median of two measurements, with a pre-call gc.collect(), to cut
    down noise from unrelated allocator/GC activity — this matters most
    at small n, where that noise can dominate the signal entirely."""
    samples = []
    for _ in range(2):
        gc.collect()
        tracemalloc.start()
        func(*args, **kwargs)
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        samples.append(peak)
    samples.sort()
    return samples[len(samples) // 2]


# --- complexity classification ----------------------------------------

def _linreg(xs, ys):
    """Ordinary least squares. Returns (slope, intercept, r2)."""
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    slope = cov / var_x if var_x else 0.0
    intercept = mean_y - slope * mean_x

    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else (1.0 if ss_res < 1e-9 else 0.0)
    return slope, intercept, r2


def fit_complexity(sizes, counts):
    """
    Fits growth of `counts` vs `sizes` by trying three regression models
    and keeping whichever has the best R^2 — this avoids the trap of
    judging "is it exponential?" from raw consecutive ratios, which is
    unreliable when input sizes themselves grow geometrically (as they
    do here): an O(n) count also roughly doubles each step in that case,
    which naive ratio-based checks can mistake for exponential growth.

    Models:
      - polynomial/log family: log(count) ~ slope * log(n)
      - exponential family:    log(count) ~ slope * n
      - factorial-ish family:  log(count) ~ slope * (n * log n)   [Stirling]

    Classes covered: O(1), O(log n), O(sqrt n), O(n), O(n log n),
    O(n^2), O(n^3), O(2^n), O(n!).
    """
    if len(sizes) < 3 or all(c <= 0 for c in counts):
        return "O(1)"
    if all(c == counts[0] for c in counts):
        return "O(1)"

    ys = [math.log(max(c, 1e-9)) for c in counts]

    log_n = [math.log(max(n, 2)) for n in sizes]
    lin_n = [float(n) for n in sizes]
    fact_n = [n * math.log(max(n, 2)) for n in sizes]

    poly_slope, _, poly_r2 = _linreg(log_n, ys)
    exp_slope, _, exp_r2 = _linreg(lin_n, ys)
    fact_slope, _, fact_r2 = _linreg(fact_n, ys)

    best = max(
        [("poly", poly_r2), ("exp", exp_r2), ("fact", fact_r2)],
        key=lambda pair: pair[1]
    )[0]

    # Require a real margin before preferring the faster-growing models
    # over the polynomial fit — on genuinely polynomial data all three
    # models tend to fit reasonably well over a short size range, so a
    # small R^2 edge for "exp" or "fact" isn't enough evidence on its own.
    if best == "exp" and exp_r2 > poly_r2 + 0.02 and exp_slope > 0.05:
        return "O(2^n)"
    if best == "fact" and fact_r2 > poly_r2 + 0.02 and fact_r2 > exp_r2:
        return "O(n!)"

    candidates = [
        (0.15, "O(1)"),
        (0.4, "O(log n)"),
        (0.7, "O(sqrt n)"),
        (1.2, "O(n)"),
        (1.7, "O(n log n)"),
        (2.5, "O(n^2)"),
        (3.5, "O(n^3)"),
    ]
    for threshold, label in candidates:
        if poly_slope < threshold:
            return label
    return "O(n^3)"  # anything steeper than our largest labeled polynomial


# --- adaptive sampling ---------------------------------------------------

def adaptive_profile(measure_once, start=8, max_size=20000, max_points=8, time_budget_s=3.0):
    """
    Generates a roughly-doubling sequence of input sizes and, at each
    step, calls measure_once(n) -> (op_count, peak_mem). Crucially, the
    time budget is checked against the ACTUAL cost of measure_once —
    which includes sys.settrace instrumentation overhead — not a cheap
    untraced dry run. An untraced timing check badly underestimates cost
    for tightly-nested loops, which is what let earlier versions of this
    profiler attempt sizes that then took far too long under tracing.
    Stops as soon as the budget is spent, so exponential/factorial/cubic
    functions back off long before n gets large.
    """
    sizes, counts, mems = [], [], []
    n = start
    elapsed_total = 0.0
    while len(sizes) < max_points and n <= max_size:
        t0 = time.perf_counter()
        count, mem = measure_once(n)
        dt = time.perf_counter() - t0

        sizes.append(n)
        counts.append(count)
        mems.append(mem)
        elapsed_total += dt

        if elapsed_total >= time_budget_s or dt > time_budget_s / 2:
            break
        n *= 2
    return sizes, counts, mems


def profile(func, make_input, **kwargs):
    """func takes one argument; make_input(size) builds it."""
    def measure_once(n):
        data = make_input(n)
        count = count_line_hits(func, data)
        mem = measure_peak_memory(func, make_input(n))
        return count, mem

    sizes, counts, mems = adaptive_profile(measure_once, **kwargs)
    return {
        "sampledInputSizes": sizes,
        "sampledOpCounts": counts,
        "timeComplexity": fit_complexity(sizes, counts),
        "spaceComplexity": fit_complexity(sizes, mems),
    }


def profile_args(func, make_args, **kwargs):
    """
    func takes multiple positional arguments; make_args(size) returns
    the full argument list, with only the first argument expected to
    scale with size.
    """
    def measure_once(n):
        count = count_line_hits(func, *make_args(n))
        mem = measure_peak_memory(func, *make_args(n))
        return count, mem

    sizes, counts, mems = adaptive_profile(measure_once, **kwargs)
    return {
        "sampledInputSizes": sizes,
        "sampledOpCounts": counts,
        "timeComplexity": fit_complexity(sizes, counts),
        "spaceComplexity": fit_complexity(sizes, mems),
    }


if __name__ == "__main__":
    def linear_scan(lst):
        total = 0
        for x in lst:
            total += x
        return total

    result = profile(linear_scan, lambda n: list(range(n)))
    print(result)
