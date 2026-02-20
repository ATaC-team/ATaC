from atac.runtimes.v1.context import WorkflowContext


def test_context_evaluation_simple():
    ctx = WorkflowContext(inputs={"name": "Alice"})
    result = ctx.evaluate_expression("Hello ${inputs.name}!")
    assert result == "Hello Alice!"

def test_context_evaluation_nested_dict():
    ctx = WorkflowContext(inputs={"config": {"retries": 3}})
    expr = {"msg": "Retries: ${inputs.config.retries}"}
    result = ctx.evaluate_expression(expr)
    assert result == {"msg": "Retries: 3"}

def test_context_variables_and_outputs():
    ctx = WorkflowContext(inputs={"x": 1})
    ctx.set_variable("y", 2)
    ctx.set_output("step1", {"result": 3})
    
    # Test the fallback existing way
    res1 = ctx.evaluate_expression("${inputs.x} + ${variables.y} = ${outputs.step1.result}")
    assert res1 == "1 + 2 = 3"
    
    # Test the documented DSL way: ${step_id.output.field}
    res2 = ctx.evaluate_expression("${inputs.x} + ${variables.y} = ${step1.output.result}")
    assert res2 == "1 + 2 = 3"
