"""Return period must agree with the percentile shown next to it (QA #23)."""
import numpy as np
import pytest

from conftest import load_step


@pytest.fixture(scope="module")
def st():
    return load_step("07_stats")


def test_pct_to_return_period(st):
    # 66th–71st percentile → about 1-in-3 years (1/(1−0.685) ≈ 3.2), never "1-in-4"
    rp, rng, beyond = st.return_period_from_pct(66, 71, 20)
    assert rp == pytest.approx(3.2, abs=0.05) and rng == [2.9, 3.4] and not beyond
    assert st.return_period_from_pct(90, 90, 20)[0] == pytest.approx(10.0)
    assert st.return_period_from_pct(50, 50, 20)[0] == pytest.approx(2.0)


def test_beyond_record_when_above_every_baseline_year(st):
    n = 20
    top = round(100 * n / (n + 1))          # 95
    rp, rng, beyond = st.return_period_from_pct(top, top, n)
    assert beyond and rp is None and rng is None


def test_month_stats_rp_inside_pct_implied_range(st):
    rng = np.random.default_rng(0)
    base = rng.gamma(2, 50, 20)
    x = float(np.percentile(base, 70))
    draws = x * rng.normal(1, 0.05, 500)
    s = st.month_stats(x, draws, base, 5, 10)
    p0, p1 = s["pct"]
    assert 100 / (100 - p0) - 0.05 <= s["return_period"] <= 100 / (100 - min(p1, 95.2)) + 0.05
