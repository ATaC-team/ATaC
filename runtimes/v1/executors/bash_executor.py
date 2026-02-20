import subprocess
import sys
from typing import Any

from runtimes.v1.models import ParsedAction


class BashExecutor:
    """Executes bash:// actions."""
    
    async def execute(self, action: ParsedAction, args: dict[str, Any]) -> Any:
        """
        Execute a bash command.
        
        Args:
            action: Should represent a bash:// scheme.
            args: Needs a 'command' argument.
            
        Returns:
            A dictionary with 'stdout', 'stderr', and 'returncode'.
        """
        if action.scheme != "bash":
            raise ValueError(f"BashExecutor cannot handle scheme: {action.scheme}")
            
        if "command" not in args:
            raise ValueError("BashExecutor requires a 'command' argument.")
            
        command = args["command"]
        
        process = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True
        )
        
        # Print stdout/stderr directly to terminal
        if process.stdout:
            sys.stdout.write(process.stdout)
        if process.stderr:
            sys.stderr.write(process.stderr)
        
        if process.returncode != 0:
             raise RuntimeError(f"Bash command failed with code {process.returncode}:\n{process.stderr}")
             
        return {
            "stdout": process.stdout,
            "stderr": process.stderr,
            "returncode": process.returncode
        }

