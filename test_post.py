import requests

def test():
    # 1. Dev login
    session = requests.Session()
    # It redirects, so we let it follow
    r1 = session.get('http://127.0.0.1:8000/api/v1/auth/accounts/dev-login/')
    print("Login:", r1.status_code)
    
    # 2. Get open events (or any event)
    r2 = session.get('http://127.0.0.1:8000/api/v1/entries/')
    print("Entries:", r2.status_code)
    
    # 3. Create an open event
    payload = {"text": "هنام", "is_open_event": True}
    r3 = session.post('http://127.0.0.1:8000/api/v1/entries/', json=payload)
    print("Create Open Event:", r3.status_code)
    
    # 4. Fetch open events
    r4 = session.get('http://127.0.0.1:8000/api/v1/entries/open_events/')
    open_events = r4.json()
    print("Open Events:", open_events)
    
    if open_events:
        ev_id = open_events[0]['id']
        # 5. Create child event
        payload = {"text": "صحيت", "parent_id": ev_id}
        r5 = session.post('http://127.0.0.1:8000/api/v1/entries/', json=payload)
        print("Create Child Event:", r5.status_code)
        if r5.status_code == 400:
            print("ERROR JSON:", r5.text)

test()
