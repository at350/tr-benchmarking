"""Allow `python -m rrd_legal_pkg` execution."""

from .cli import main


if __name__ == "__main__":
    raise SystemExit(main())
