"""Bounded functional checker for benchmark-only HumanEval submissions.

This is deliberately smaller than Python: no imports, attribute introspection,
filesystem/network builtins, or arbitrary call targets from generated code.
"""
import ast
import json
import resource
import sys

resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
try:
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
except ValueError:
    # macOS can refuse RLIMIT_AS. The AST restrictions, CPU limit and parent
    # process timeout remain in force; memory is reported as not hard-capped.
    pass
resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))

SAFE_BUILTINS = {name: getattr(__builtins__, name) for name in (
    'abs', 'all', 'any', 'bin', 'bool', 'enumerate', 'float', 'int', 'len', 'list',
    'map', 'max', 'min', 'range', 'reversed', 'round', 'set', 'sorted',
    'str', 'sum', 'tuple', 'zip')}
SAFE_METHODS = {'append', 'clear', 'count', 'endswith', 'find', 'index', 'items',
                'join', 'keys', 'lower', 'replace', 'reverse', 'sort',
                'split', 'startswith', 'strip', 'upper', 'values'}
BLOCKED = (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal, ast.ClassDef,
           ast.With, ast.AsyncWith, ast.Try, ast.Raise, ast.Lambda,
           ast.Yield, ast.YieldFrom, ast.Await, ast.AsyncFunctionDef,
           ast.Delete, ast.NamedExpr)

def source_from_answer(answer, prefix, entry):
    text = answer.strip()
    if '```' in text:
        blocks = text.split('```')
        if len(blocks) < 3:
            raise ValueError('unclosed code fence')
        text = blocks[1].removeprefix('python').lstrip('\n')
    if not text.lstrip().startswith('def '):
        text = prefix + text
    lines = [line for line in text.splitlines()
             if not line.strip().startswith(('from typing import ', 'import typing'))]
    text = '\n'.join(lines) + '\n'
    if len(text) > 8000:
        raise ValueError('code too long')
    tree = ast.parse(text)
    definitions = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
    if entry not in definitions:
        raise ValueError('entry function missing')
    for node in ast.walk(tree):
        if isinstance(node, BLOCKED):
            raise ValueError(f'unsupported syntax: {type(node).__name__}')
        if isinstance(node, ast.Name) and node.id.startswith('__'):
            raise ValueError('dunder name denied')
        if isinstance(node, ast.Constant) and isinstance(node.value, int) and abs(node.value) > 100000:
            raise ValueError('numeric literal too large')
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) > 5000:
            raise ValueError('string literal too long')
        if isinstance(node, ast.Attribute) and node.attr not in SAFE_METHODS:
            raise ValueError('attribute denied')
        if isinstance(node, ast.Call):
            fn = node.func
            if isinstance(fn, ast.Name):
                if fn.id not in SAFE_BUILTINS and fn.id not in definitions:
                    raise ValueError(f'call denied: {fn.id}')
            elif not isinstance(fn, ast.Attribute) or fn.attr not in SAFE_METHODS:
                raise ValueError('dynamic call denied')
    return tree

try:
    payload = json.loads(sys.stdin.read(20000))
    tree = source_from_answer(payload['answer'], payload['prefix'], payload['entryPoint'])
    namespace = {'__builtins__': SAFE_BUILTINS, 'List': list, 'Tuple': tuple,
                 'Dict': dict, 'Optional': object, 'Set': set}
    exec(compile(tree, '<restricted-generated-code>', 'exec'), namespace)
    # Published tests are fixed in the frozen fixture. The candidate function
    # keeps the restricted global namespace above when called by these tests.
    exec(payload['tests'], namespace)
    namespace['check'](namespace[payload['entryPoint']])
    print(json.dumps({'status': 'passed'}))
except Exception as error:
    print(json.dumps({'status': 'failed', 'reason': type(error).__name__,
                      'detail': str(error)[:250]}))
