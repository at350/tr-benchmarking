import json
import re
from typing import Dict, Any, Optional

# Shared with lsh/; callers put the repository root on sys.path.
from lsh.utils import clean_text

def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """
    Robustly extracts a JSON object from an LLM response string.
    Handles Markdown code blocks and trailing characters.
    """
    if not text:
        return None
        
    text = text.strip()
    
    # Try to extract from a ```json ... ``` block
    json_block_match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if json_block_match:
        try:
            return json.loads(json_block_match.group(1))
        except json.JSONDecodeError:
            pass # Fall back to raw search
            
    # Otherwise scan for the first balanced JSON object in the text. Trying each '{' in
    # turn copes with stray braces or a broken code fence before the real object.
    decoder = json.JSONDecoder()
    for start in (i for i, ch in enumerate(text) if ch == '{'):
        try:
            candidate, _ = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(candidate, dict):
            return candidate
    return None


def format_irac_for_embedding(irac_dict: Dict[str, Any]) -> str:
    """
    Takes a parsed IRAC dictionary and formats it cleanly for the embedding model.
    """
    issue = clean_text(irac_dict.get('issue', ''))
    rule = clean_text(irac_dict.get('rule', ''))
    application = clean_text(irac_dict.get('application', ''))
    conclusion = clean_text(irac_dict.get('conclusion', ''))
    
    formatted = []
    if issue: formatted.append(f"Issue: {issue}")
    if rule: formatted.append(f"Rule: {rule}")
    if application: formatted.append(f"Application: {application}")
    if conclusion: formatted.append(f"Conclusion: {conclusion}")
    
    return "\n".join(formatted)
