"""Single launcher for Research Copilot — starts both backend and frontend."""

import subprocess
import sys
import os
import signal
import platform

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(ROOT, "frontend")

def main():
    procs = []

    try:
        # Start backend
        print("\033[94m[LAUNCHER]\033[0m Starting backend (uvicorn)...")
        backend_cmd = [
            sys.executable, "-m", "uvicorn",
            "backend.main:app",
            "--reload", "--host", "0.0.0.0", "--port", "8000",
        ]
        backend = subprocess.Popen(
            backend_cmd,
            cwd=ROOT,
            env={**os.environ, "PYTHONPATH": ROOT},
        )
        procs.append(backend)

        # Start frontend
        print("\033[92m[LAUNCHER]\033[0m Starting frontend (vite)...")
        npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
        frontend = subprocess.Popen(
            [npm_cmd, "run", "dev"],
            cwd=FRONTEND_DIR,
        )
        procs.append(frontend)

        print("\033[93m[LAUNCHER]\033[0m Both services started.")
        print("\033[93m[LAUNCHER]\033[0m Frontend: http://localhost:5173")
        print("\033[93m[LAUNCHER]\033[0m Backend:  http://localhost:8000")
        print("\033[93m[LAUNCHER]\033[0m Press Ctrl+C to stop both.\n")

        # Wait for either to exit
        while True:
            for p in procs:
                ret = p.poll()
                if ret is not None:
                    print(f"\033[91m[LAUNCHER]\033[0m Process exited with code {ret}. Shutting down...")
                    raise KeyboardInterrupt
            import time
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n\033[93m[LAUNCHER]\033[0m Shutting down...")
        for p in procs:
            try:
                if platform.system() == "Windows":
                    p.terminate()
                else:
                    os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception:
                pass
        for p in procs:
            try:
                p.wait(timeout=5)
            except Exception:
                p.kill()
        print("\033[93m[LAUNCHER]\033[0m Done.")


if __name__ == "__main__":
    main()