from enum import Enum
from dataclasses import dataclass, field
from typing import Optional


class Region(str, Enum):
    AUSTRALIA = "australia"
    MALAYSIA = "malaysia"
    UNKNOWN = "unknown"


@dataclass
class RegionConfig:
    validity_cap_years: int
    pl_min_aud: float
    accepted_standards: dict = field(default_factory=dict)
    require_cidb: bool = False
    omit_location: bool = False
    name_exempt_issuers: list = field(default_factory=list)


REGION_CONFIGS = {
    Region.AUSTRALIA: RegionConfig(
        validity_cap_years=3,
        pl_min_aud=20_000_000.0,
        omit_location=True,
    ),
    Region.MALAYSIA: RegionConfig(
        validity_cap_years=10,
        pl_min_aud=20_000_000.0,
        accepted_standards={
            "ms 1722": "iso 45001",
        },
        require_cidb=False,
        name_exempt_issuers=[
            "bem", "acem", "bqsm", "board of valuers", "lam",
            "lembaga jurutera malaysia",
            "board of engineers malaysia",
        ],
    ),
    Region.UNKNOWN: RegionConfig(
        validity_cap_years=10,
        pl_min_aud=20_000_000.0,
    ),
}


def detect_region(title: str) -> Region:
    if not title:
        return Region.MALAYSIA
    t = title.strip().lower()
    if "(australia)" in t:
        return Region.AUSTRALIA
    au_states = ["(nsw)", "(qld)", "(act)", "(vic)", "(sa)", "(wa)", "(tas)", "(nt)",
                 "new south wales", "queensland", "victoria",
                 "australian capital territory", "western australia",
                 "south australia", "tasmania", "northern territory"]
    if any(s in t for s in au_states):
        return Region.AUSTRALIA
    return Region.MALAYSIA


def is_contractors_questionnaire(title: str) -> bool:
    if not title:
        return False
    return "contractor" in title.strip().lower()


def get_region_config(region: Region) -> RegionConfig:
    return REGION_CONFIGS.get(region, REGION_CONFIGS[Region.UNKNOWN])
