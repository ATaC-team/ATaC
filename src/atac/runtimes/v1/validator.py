import json
from pathlib import Path
from typing import Any

import jsonschema
from jsonschema import ValidationError


class AtacValidator:
    """Validator for ATaC Trajectories using JSON Schema."""

    def __init__(self, schema_path: str = None):
        """
        Initialize the validator.

        Args:
            schema_path: Path to the JSON schema file. If None, tries to find
                         specs/v1/schema.json relative to this file.
        """
        if schema_path is None:
            # Default path: ../../specs/v1/schema.json relative to runtimes/v1/validator.py
            schema_path = (
                Path(__file__).resolve().parents[2] / "specs" / "v1" / "schema.json"
            )

        path_obj = Path(schema_path).resolve()
        self.schema_path = str(path_obj)

        if not path_obj.exists():
            raise FileNotFoundError(f"Schema file not found at: {self.schema_path}")

        with path_obj.open() as f:
            self.schema = json.load(f)

    def validate(self, data: dict[str, Any]) -> None:
        """
        Validate the given trajectory data against the schema.

        Args:
            data: The trajectory data (as a dictionary).

        Raises:
            jsonschema.ValidationError: If the data is invalid.
        """
        jsonschema.validate(instance=data, schema=self.schema)

    def is_valid(self, data: dict[str, Any]) -> bool:
        """
        Check if the data is valid.

        Args:
            data: The trajectory data.

        Returns:
            True if valid, False otherwise.
        """
        try:
            self.validate(data)
            return True
        except ValidationError:
            return False
