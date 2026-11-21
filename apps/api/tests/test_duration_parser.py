"""
Unit tests for duration parsing (ISO 8601 and Twitch formats).
"""

from app.services.metadata.base import parse_iso8601_duration, parse_twitch_duration


class TestDurationParsers:
    def test_iso8601_hours_minutes_seconds(self):
        assert parse_iso8601_duration("PT1H2M10S") == 3730

    def test_iso8601_minutes_only(self):
        assert parse_iso8601_duration("PT45M") == 2700

    def test_iso8601_seconds_only(self):
        assert parse_iso8601_duration("PT30S") == 30

    def test_iso8601_with_days(self):
        assert parse_iso8601_duration("P1DT2H3M4S") == 86400 + 7200 + 180 + 4

    def test_iso8601_fractional_seconds(self):
        assert parse_iso8601_duration("PT10.5S") == 10

    def test_iso8601_invalid(self):
        assert parse_iso8601_duration("invalid") == 0
        assert parse_iso8601_duration("") == 0

    def test_twitch_hours_minutes_seconds(self):
        assert parse_twitch_duration("3h24m10s") == (3 * 3600) + (24 * 60) + 10

    def test_twitch_minutes_seconds(self):
        assert parse_twitch_duration("45m12s") == (45 * 60) + 12

    def test_twitch_seconds_only(self):
        assert parse_twitch_duration("30s") == 30

    def test_twitch_hours_minutes(self):
        assert parse_twitch_duration("1h30m") == (1 * 3600) + (30 * 60)

    def test_twitch_invalid(self):
        assert parse_twitch_duration("") == 0
