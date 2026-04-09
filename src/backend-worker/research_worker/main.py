from __future__ import annotations

import argparse
import os
import socket

from research_worker.runner import run_worker


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the minimal research task worker.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process queued tasks until the queue is empty, then exit.",
    )
    parser.add_argument(
        "--worker-name",
        default=os.getenv("WORKER_NAME") or socket.gethostname(),
        help="Name written into task stage logs.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=float(os.getenv("WORKER_POLL_INTERVAL_SECONDS", "3")),
        help="Polling interval in seconds for continuous mode.",
    )
    parser.add_argument(
        "--max-tasks",
        type=int,
        default=0,
        help="Maximum number of tasks to process in this run. 0 means no limit.",
    )
    parser.add_argument(
        "--stage-delay",
        type=float,
        default=float(os.getenv("WORKER_STAGE_DELAY_SECONDS", "0")),
        help="Optional extra delay in seconds between stage transitions.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    max_tasks = args.max_tasks if args.max_tasks > 0 else None

    summary = run_worker(
        worker_name=args.worker_name,
        once=args.once,
        max_tasks=max_tasks,
        poll_interval=args.poll_interval,
        stage_delay=args.stage_delay,
    )

    print(
        "Worker run finished: "
        f"claimed={summary.claimed_tasks}, "
        f"completed={summary.completed_tasks}, "
        f"failed={summary.failed_tasks}"
    )


if __name__ == "__main__":
    main()
