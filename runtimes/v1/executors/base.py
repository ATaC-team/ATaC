from typing import Any, Protocol

from runtimes.v1.models import ParsedAction


class ActionExecutor(Protocol):
    """Protocol for action executors."""
    
    async def execute(self, action: ParsedAction, args: dict[str, Any]) -> Any:
        """
        Execute the parsed action with the given arguments.
        
        Args:
            action: The parsed action details (scheme, server, method, etc.)
            args: The arguments required for execution (from the step definition).
            
        Returns:
            The output of the execution.
        """
        ...
