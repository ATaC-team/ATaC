import urllib.parse

from atac.runtimes.v1.models import ParsedAction


class ActionParser:
    """Parses ATaC action URLs into structured data."""

    
    @staticmethod
    def parse(action_url: str) -> ParsedAction:
        """
        Parse an action URL like 'mcp://server/method?param=value'
        or 'bash://run'
        
        Args:
            action_url: The action string from the step definition.
            
        Returns:
            ParsedAction dataclass.
            
        Raises:
            ValueError: If the URL is malformed or scheme is unsupported.
        """
        parsed = urllib.parse.urlparse(action_url)
        
        scheme = parsed.scheme.lower()
        if scheme not in ("mcp", "bash"):
            raise ValueError(f"Unsupported action scheme: {scheme}")
            
        # The 'netloc' usually holds the server name in our format mcp://server/...
        # Sometimes if there's no // it gets parsed differently, but our schema enforces //
        server_or_cmd = parsed.netloc
        
        # Path might have a leading slash
        method = parsed.path.lstrip('/')
        
        # Parse query params
        query_params = {}
        if parsed.query:
            query_dict = urllib.parse.parse_qs(parsed.query)
            # parse_qs returns a list for each key, take the first one
            query_params = {k: v[0] for k, v in query_dict.items()}
            
        return ParsedAction(
            scheme=scheme,
            server_or_cmd=server_or_cmd,
            method=method,
            query_params=query_params
        )
