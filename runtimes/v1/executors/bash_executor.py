import subprocess
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
        
        # Execute the command
        # For security in a real system, you might want to sandbox this.
        # Here we just run it directly for demonstration.
        process = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True
        )
        
        if process.returncode != 0:
             # In a real engine, we might raise an error or just return it.
             # According to standard behavior, let's just return it, 
             # allowing the DSL user to handle retries/errors later if we add them back.
             # Alternatively, raise an exception. Let's raise an exception to stop workflow by default.
             raise RuntimeError(f"Bash command failed with code {process.returncode}:\n{process.stderr}")
             
        return {
            "stdout": process.stdout,
            "stderr": process.stderr,
            "returncode": process.returncode
        }
