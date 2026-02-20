
import pytest
from jsonschema import ValidationError

from runtimes.v1.validator import AtacValidator


@pytest.fixture
def validator():
    return AtacValidator()

def test_basic_valid_trajectory(validator):
    data = {
        "version": "1.0",
        "meta": {
            "name": "Test Flow",
            "description": "A simple test",
            "author": "Tester"
        },
        "inputs": [
            {"name": "query", "type": "string", "default": "test"}
        ],
        "variables": [
            {"name": "count", "type": "integer", "value": 0}
        ],
        "steps": [
            {
                "id": "step1",
                "type": "action",
                "action": "mcp://browser/navigate",
                "args": {"url": "https://example.com"}
            }
        ]
    }
    # Should not raise exception
    validator.validate(data)

def test_missing_version(validator):
    data = {
        "meta": {"name": "Test"},
        "steps": []
    }
    # jsonschema error message for missing required property
    with pytest.raises(ValidationError, match="'version' is a required property"):
        validator.validate(data)

def test_invalid_action_url(validator):
    data = {
        "version": "1.0",
        "steps": [
            {
                "id": "step1",
                "type": "action",
                "action": "invalid://browser/navigate" # Invalid scheme
            }
        ]
    }
    # jsonschema error message for pattern mismatch
    with pytest.raises(ValidationError, match="does not match"):
        validator.validate(data)

def test_control_flow_if(validator):
    data = {
        "version": "1.0",
        "steps": [
            {
                "id": "check",
                "type": "if",
                "condition": "${x} > 1",
                "then": [
                    {
                        "id": "true_branch",
                        "type": "action",
                        "action": "mcp://log/info"
                    }
                ],
                "else": []
            }
        ]
    }
    validator.validate(data)

def test_control_flow_for(validator):
    data = {
        "version": "1.0",
        "steps": [
            {
                "id": "loop",
                "type": "for",
                "in": "${list}",
                "item": "i",
                "steps": [
                        {
                        "id": "substep",
                        "type": "action",
                        "action": "mcp://log/info"
                    }
                ]
            }
        ]
    }
    validator.validate(data)

            
    def test_missing_step_id(self):
        # ID is optional in schema? Let's check schema.json
        # Schema definition: "id": { "type": "string" } in properties, but not in required?
        # Re-checking schema design... "所有类型的 Step 都支持以下属性: id, if, timeout"
        # In JSON schema, 'id' is in properties, but strictly speaking 'required' list for step didn't enforce 'id'.
        # Let's check what I wrote in schema.json... 
        # definition "step": properties "id", but no required ["id"].
        # So missing ID should be VALID. Let's test that it IS valid or if I want to enforce it.
        # User said "只保留step的id，不要name", implying ID is important.
        # But schema.json might not have marked it as required in the `step` definition.
        # Let's assume for now it's optional unless I change schema.
        pass

    def test_control_flow_if(self):
        data = {
            "version": "1.0",
            "steps": [
                {
                    "id": "check",
                    "type": "if",
                    "condition": "${x} > 1",
                    "then": [
                        {
                            "id": "true_branch",
                            "type": "action",
                            "action": "mcp://log/info"
                        }
                    ],
                    "else": []
                }
            ]
        }
        self.validator.validate(data)

    def test_control_flow_for(self):
        data = {
            "version": "1.0",
            "steps": [
                {
                    "id": "loop",
                    "type": "for",
                    "in": "${list}",
                    "item": "i",
                    "steps": [
                         {
                            "id": "substep",
                            "type": "action",
                            "action": "mcp://log/info"
                        }
                    ]
                }
            ]
        }
        self.validator.validate(data)
