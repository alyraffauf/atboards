"""TUI data fetching — thin wrappers around core.records."""

# Re-export from core for backwards compatibility
from core.records import delete_record, hydrate_replies as fetch_replies, hydrate_threads as fetch_threads
