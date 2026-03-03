import re
import numpy as np
import os
from typing import List

# Try to import sentence_transformers, handle case where it's not installed
try:
    from sentence_transformers import SentenceTransformer
    _EMBEDDING_MODEL = None
except ImportError:
    _EMBEDDING_MODEL = None
    print("Warning: sentence-transformers not installed. Embeddings will be random.")

try:
    import torch
    from transformers import AutoModel, AutoTokenizer
except ImportError:
    torch = None
    AutoModel = None
    AutoTokenizer = None
    print("Warning: transformers/torch not installed. LegalBERT embeddings unavailable.")

def clean_text(text: str) -> str:
    """
    Normalizes text by removing extra whitespace, aggressive punctuation,
    and common LLM boilerplate.
    """
    text = text.strip()
    
    # Remove "As an AI..." boilerplate (simple heuristic)
    text = re.sub(r"^(As an AI|I am an AI)[^.]*\.", "", text, flags=re.IGNORECASE)
    
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)
    
    return text.strip()

# Redefine _EMBEDDING_MODEL and get_embedding_model as per instructions
_EMBEDDING_MODEL = None # Resetting global variable for clarity with new get_embedding_model
_LEGALBERT_ENCODER = None

def get_embedding_model(model_name: str):
    global _EMBEDDING_MODEL
    try:
        # If the model is already loaded and it's the same model_name, return it
        # This assumes _EMBEDDING_MODEL stores the last loaded model.
        # For a true singleton per model_name, a dictionary would be better,
        # but for simplicity, we'll just reload if the name changes or it's not loaded.
        if _EMBEDDING_MODEL is None or _EMBEDDING_MODEL.default_model != model_name:
            print(f"Loading embedding model: {model_name}...")
            _EMBEDDING_MODEL = SentenceTransformer(model_name)
        return _EMBEDDING_MODEL
    except Exception as e:
         print(f"Error loading model {model_name}: {e}")
         return None

def encode_responses(texts: List[str], model_name: str = 'hkunlp/instructor-large', instruction: str = None) -> np.ndarray:
    """
    Encodes a list of texts into dense vectors.
    Supports Instruction-Tuned models (e.g., hkunlp/instructor-large) which take context.
    
    Args:
        texts: List of text strings to encode.
        model_name: HuggingFace model name.
        instruction: Optional task instruction (e.g., "Represent the legal conclusion:").
    """
    model = get_embedding_model(model_name)
    if model:
        if "instructor" in model_name.lower() and instruction:
            # Instructor models expect [[instruction, text], ...]
            print(f"Encoding with instruction: '{instruction}'")
            inputs = [[instruction, text] for text in texts]
            embeddings = model.encode(inputs)
        else:
            # Standard models (or if no instruction provided)
            # If instruction provided for non-instructor model, prepend it
            if instruction:
                 inputs = [f"{instruction} {text}" for text in texts]
                 embeddings = model.encode(inputs)
            else:
                 embeddings = model.encode(texts)
                 
        return embeddings
    else:
        # Fallback for testing without model
        print("Using random embeddings (mock mode)")
        # Default dimension for Instructor-Large is 768
        return np.random.randn(len(texts), 768)


class LegalBERTEncoder:
    def __init__(self, model_name: str = "nlpaueb/legal-bert-base-uncased", device: str = None):
        if AutoTokenizer is None or AutoModel is None or torch is None:
            raise RuntimeError("transformers/torch not available for LegalBERT encoding.")
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name).to(self.device)
        self.model.eval()

    @torch.no_grad()
    def encode(self, texts: List[str], batch_size: int = 8, max_length: int = 512) -> np.ndarray:
        vectors = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            inputs = self.tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=max_length,
                return_tensors="pt",
            ).to(self.device)
            outputs = self.model(**inputs)

            token_embeddings = outputs.last_hidden_state
            attention_mask = inputs["attention_mask"]
            mask = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
            summed = (token_embeddings * mask).sum(dim=1).cpu().numpy()
            summed_mask = mask.sum(dim=1).clamp(min=1e-9).cpu().numpy()
            mean_pooled = summed / summed_mask
            vectors.append(mean_pooled)

        return np.vstack(vectors)


def encode_responses_legalbert(
    texts: List[str],
    model_name: str = "nlpaueb/legal-bert-base-uncased",
    batch_size: int = 8,
    max_length: int = 512,
) -> np.ndarray:
    global _LEGALBERT_ENCODER
    try:
        if _LEGALBERT_ENCODER is None:
            print(f"Loading LegalBERT model: {model_name}...")
            _LEGALBERT_ENCODER = LegalBERTEncoder(model_name=model_name)
        return _LEGALBERT_ENCODER.encode(texts, batch_size=batch_size, max_length=max_length)
    except Exception as e:
        print(f"Error loading/encoding with LegalBERT {model_name}: {e}")
        print("Using random embeddings (mock mode)")
        return np.random.randn(len(texts), 768)
