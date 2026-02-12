
import json
import re

RESULTS_FILE = "lsh/results/run_20260210_165811.json"

def clean_text_for_verdict(text):
    # Remove markdown bold/italics
    text = re.sub(r'[*_]', '', text)
    # Normalize whitespace
    text = " ".join(text.split())
    return text.lower()

def get_verdict_hint(text):
    # Only look at the very beginning for the "Short answer" or header
    # Many models put the verdict in the first 100 chars.
    clean = clean_text_for_verdict(text[:200])
    
    # Strict NO patterns
    no_patterns = [
        "not enforceable", "unenforceable", "probably not", "likely not", 
        "unlikely", "no, the", "no. the", "no the", "short answer: no", 
        "answer: no"
    ]
    # Strict YES patterns
    yes_patterns = [
        "is enforceable", "are enforceable", "likely enforceable", 
        "probably yes", "likely yes", "very likely yes", "short answer: yes",
        "answer: yes", "potentially enforceable", "may be enforceable"
    ]
    
    for p in no_patterns:
        if p in clean:
            return "NO"
            
    for p in yes_patterns:
        if p in clean:
            return "YES"
            
    return "AMBIGUOUS"

def deep_inspect():
    with open(RESULTS_FILE, "r") as f:
        data = json.load(f)

    for cluster_id, cluster_data in data['clusters'].items():
        if cluster_id == "noise": 
            continue
        
        members = cluster_data['members']
        print(f"\n=== Cluster {cluster_id} (Size: {len(members)}) ===")
        
        verdicts = []
        for m in members:
            v = get_verdict_hint(m['text'][:300]) # Check first 300 chars usually contains the stance
            verdicts.append(v)
            
        yes_count = verdicts.count("YES")
        no_count = verdicts.count("NO")
        amb_count = verdicts.count("AMBIGUOUS")
        
        print(f"Verdicts: YES={yes_count}, NO={no_count}, AMBIGUOUS={amb_count}")
        
        # If mixed, print details
        if yes_count > 0 and no_count > 0:
            print("!!! MIXED CLUSTER DETECTED !!!")
            print("--- YES Examples ---")
            for i, v in enumerate(verdicts):
                if v == "YES":
                    print(f"[{members[i]['model']}] {members[i]['text'][:300]}...")
                    break
            print("--- NO Examples ---")
            for i, v in enumerate(verdicts):
                if v == "NO":
                    print(f"[{members[i]['model']}] {members[i]['text'][:300]}...")
                    break

if __name__ == "__main__":
    deep_inspect()
