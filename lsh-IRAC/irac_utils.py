import json
import re
from typing import Dict, Any, Optional

def clean_text(text: str) -> str:
    """
    Normalizes text by removing extra whitespace, aggressive punctuation,
    and common LLM boilerplate.
    """
    if not text:
        return ""
    text = str(text).strip()
    
    # Remove "As an AI..." boilerplate (simple heuristic)
    text = re.sub(r"^(As an AI|I am an AI)[^.]*\.", "", text, flags=re.IGNORECASE)
    
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)
    
    return text.strip()

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
            
    # Try to find the first { and the last }
    start_idx = text.find('{')
    end_idx = text.rfind('}')
    
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        json_str = text[start_idx:end_idx+1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass # Return None if completely failed
            
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
