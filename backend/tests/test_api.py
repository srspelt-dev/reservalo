"""End-to-end API tests covering auth, multi-tenant isolation and the public flow."""
from datetime import date, datetime


def _register(client, slug="barberia-demo", email="owner@demo.com"):
    resp = client.post(
        "/auth/register",
        json={
            "business_name": "Barbería Demo",
            "slug": slug,
            "name": "Carlos",
            "email": email,
            "password": "secret123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_register_login_and_me(client):
    token = _register(client)
    me = client.get("/auth/me", headers=_auth(token))
    assert me.status_code == 200
    assert me.json()["role"] == "owner"

    login = client.post("/auth/login", json={"email": "owner@demo.com", "password": "secret123"})
    assert login.status_code == 200
    assert "access_token" in login.json()


def test_register_defaults_to_asuncion_timezone(client):
    token = _register(client)
    tenant = client.get("/tenant", headers=_auth(token)).json()
    assert tenant["timezone"] == "America/Asuncion"


def test_invalid_timezone_rejected(client):
    resp = client.post(
        "/auth/register",
        json={
            "business_name": "X Negocio",
            "slug": "x-negocio",
            "name": "Ana",
            "email": "ana@x.com",
            "password": "secret123",
            "timezone": "Mars/Phobos",
        },
    )
    assert resp.status_code == 422


def _setup_business(client, token):
    svc = client.post(
        "/services", headers=_auth(token),
        json={"name": "Corte", "duration_minutes": 30, "price": "50000"},
    ).json()
    res = client.post("/resources", headers=_auth(token), json={"name": "Silla 1"}).json()
    for dow in range(7):
        client.post(
            "/schedules", headers=_auth(token),
            json={"resource_id": res["id"], "day_of_week": dow,
                  "start_time": "08:00", "end_time": "20:00"},
        )
    return svc, res


def test_public_booking_flow_and_conflict(client):
    token = _register(client)
    svc, res = _setup_business(client, token)

    day = date.fromordinal(date.today().toordinal() + 7).isoformat()
    av = client.get(
        "/public/barberia-demo/availability",
        params={"service_id": svc["id"], "resource_id": res["id"], "day": day},
    )
    assert av.status_code == 200
    slots = av.json()["slots"]
    assert len(slots) > 0
    slot = slots[0]

    booking = client.post(
        "/public/barberia-demo/booking",
        json={"service_id": svc["id"], "resource_id": res["id"],
              "client_name": "Juan", "start_datetime": slot},
    )
    assert booking.status_code == 201
    assert booking.json()["status"] == "pending"

    # second booking on same slot -> conflict
    dup = client.post(
        "/public/barberia-demo/booking",
        json={"service_id": svc["id"], "resource_id": res["id"],
              "client_name": "Pedro", "start_datetime": slot},
    )
    assert dup.status_code == 409


def test_tenant_isolation(client):
    t1 = _register(client, slug="negocio-uno", email="uno@demo.com")
    svc1, _ = _setup_business(client, t1)

    t2 = _register(client, slug="negocio-dos", email="dos@demo.com")
    # tenant 2 sees no services
    assert client.get("/services", headers=_auth(t2)).json() == []
    # tenant 2 cannot edit tenant 1's service
    resp = client.put(f"/services/{svc1['id']}", headers=_auth(t2), json={"name": "hack"})
    assert resp.status_code == 404


def _book_public(client, svc, res):
    day = date.fromordinal(date.today().toordinal() + 7).isoformat()
    av = client.get(
        "/public/barberia-demo/availability",
        params={"service_id": svc["id"], "resource_id": res["id"], "day": day},
    ).json()
    slot = av["slots"][0]
    booking = client.post(
        "/public/barberia-demo/booking",
        json={"service_id": svc["id"], "resource_id": res["id"],
              "client_name": "Juan", "start_datetime": slot},
    ).json()
    return booking, slot


def test_public_booking_returns_management_code(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    booking, _ = _book_public(client, svc, res)
    assert booking["public_code"]


def test_client_can_view_cancel_booking_by_code(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    booking, _ = _book_public(client, svc, res)
    code = booking["public_code"]

    detail = client.get(f"/public/barberia-demo/booking/{code}")
    assert detail.status_code == 200
    assert detail.json()["can_manage"] is True

    cancelled = client.post(f"/public/barberia-demo/booking/{code}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["can_manage"] is False

    # second cancel is rejected
    assert client.post(f"/public/barberia-demo/booking/{code}/cancel").status_code == 409


def test_client_can_reschedule_by_code(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    booking, slot = _book_public(client, svc, res)
    code = booking["public_code"]

    # pick a later slot the same day
    day = slot[:10]
    slots = client.get(
        "/public/barberia-demo/availability",
        params={"service_id": svc["id"], "resource_id": res["id"], "day": day},
    ).json()["slots"]
    new_slot = next(s for s in slots if s != slot)

    resp = client.put(
        f"/public/barberia-demo/booking/{code}/reschedule",
        json={"start_datetime": new_slot},
    )
    assert resp.status_code == 200
    assert resp.json()["start_datetime"].startswith(new_slot[:13])


def test_unknown_code_is_404(client):
    _register(client)
    assert client.get("/public/barberia-demo/booking/nope").status_code == 404


def test_default_payment_is_cash(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    booking, _ = _book_public(client, svc, res)
    # default tenant accepts only cash -> single method auto-selected
    assert booking["payment_method"] == "cash"
    assert booking["payment_status"] == "pending"


def test_transfer_rejected_when_not_accepted(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    day = date.fromordinal(date.today().toordinal() + 7).isoformat()
    slot = client.get(
        "/public/barberia-demo/availability",
        params={"service_id": svc["id"], "resource_id": res["id"], "day": day},
    ).json()["slots"][0]
    resp = client.post(
        "/public/barberia-demo/booking",
        json={"service_id": svc["id"], "resource_id": res["id"],
              "client_name": "Juan", "start_datetime": slot, "payment_method": "transfer"},
    )
    assert resp.status_code == 409


def test_owner_updates_branding_and_payments(client):
    token = _register(client)
    resp = client.put(
        "/tenant", headers=_auth(token),
        json={"brand_color": "#ff0000", "description": "Mi negocio",
              "accept_transfer": True, "payment_alias": "juan.barber", "deposit_percent": 50},
    )
    assert resp.status_code == 200
    tenant = client.get("/tenant", headers=_auth(token)).json()
    assert tenant["brand_color"] == "#ff0000"
    assert tenant["accept_transfer"] is True
    assert tenant["payment_alias"] == "juan.barber"
    assert tenant["deposit_percent"] == 50

    # invalid color rejected
    bad = client.put("/tenant", headers=_auth(token), json={"brand_color": "rojo"})
    assert bad.status_code == 422


def test_transfer_accepted_after_enabling(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    client.put("/tenant", headers=_auth(token),
               json={"accept_transfer": True, "payment_alias": "alias.test"})
    day = date.fromordinal(date.today().toordinal() + 7).isoformat()
    slot = client.get(
        "/public/barberia-demo/availability",
        params={"service_id": svc["id"], "resource_id": res["id"], "day": day},
    ).json()["slots"][0]
    booking = client.post(
        "/public/barberia-demo/booking",
        json={"service_id": svc["id"], "resource_id": res["id"],
              "client_name": "Juan", "start_datetime": slot, "payment_method": "transfer"},
    ).json()
    assert booking["payment_method"] == "transfer"


def test_owner_can_mark_booking_paid(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    booking, _ = _book_public(client, svc, res)
    bid = booking["id"]
    resp = client.put(f"/bookings/{bid}", headers=_auth(token), json={"payment_status": "paid"})
    assert resp.status_code == 200
    assert resp.json()["payment_status"] == "paid"


def _upgrade(client, owner_token, plan_code="business"):
    return client.post(
        "/subscription/change", headers=_auth(owner_token), json={"plan_code": plan_code}
    )


def _create_staff(client, owner_token, email="staff@demo.com"):
    # Free plan only allows 1 user; upgrade so staff management is testable.
    _upgrade(client, owner_token, "business")
    return client.post(
        "/users", headers=_auth(owner_token),
        json={"name": "Empleado", "email": email, "password": "secret123", "role": "staff"},
    )


def test_owner_creates_and_lists_staff(client):
    token = _register(client)
    resp = _create_staff(client, token)
    assert resp.status_code == 201
    assert resp.json()["role"] == "staff"

    users = client.get("/users", headers=_auth(token)).json()
    emails = {u["email"] for u in users}
    assert {"owner@demo.com", "staff@demo.com"} <= emails  # owner + new staff

    # the new staff can log in
    login = client.post("/auth/login", json={"email": "staff@demo.com", "password": "secret123"})
    assert login.status_code == 200


def test_staff_cannot_manage_users(client):
    token = _register(client)
    _create_staff(client, token)
    staff_token = client.post(
        "/auth/login", json={"email": "staff@demo.com", "password": "secret123"}
    ).json()["access_token"]
    assert client.get("/users", headers=_auth(staff_token)).status_code == 403
    assert _create_staff(client, staff_token, email="x@demo.com").status_code == 403


def test_duplicate_email_in_business_rejected(client):
    token = _register(client)  # owner@demo.com
    resp = _create_staff(client, token, email="owner@demo.com")
    assert resp.status_code == 409


def test_cannot_deactivate_self_or_last_owner(client):
    token = _register(client)
    me = client.get("/auth/me", headers=_auth(token)).json()
    # deactivating yourself is blocked
    assert client.delete(f"/users/{me['id']}", headers=_auth(token)).status_code == 409
    # demoting the only owner to staff is blocked
    resp = client.put(f"/users/{me['id']}", headers=_auth(token), json={"role": "staff"})
    assert resp.status_code == 409


def test_owner_can_deactivate_staff(client):
    token = _register(client)
    staff = _create_staff(client, token).json()
    assert client.delete(f"/users/{staff['id']}", headers=_auth(token)).status_code == 204
    # deactivated staff can no longer log in
    login = client.post("/auth/login", json={"email": "staff@demo.com", "password": "secret123"})
    assert login.status_code == 403


def test_reports_owner_only_and_totals(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    _book_public(client, svc, res)
    _upgrade(client, token, "business")  # reports require the advanced_reports feature
    # seeded bookings are ~7 days ahead; query a window that includes them
    today = date.today()
    rep = client.get(
        "/reports",
        headers=_auth(token),
        params={"date_from": today.isoformat(),
                "date_to": date.fromordinal(today.toordinal() + 14).isoformat()},
    )
    assert rep.status_code == 200
    data = rep.json()
    assert data["total_bookings"] >= 1
    assert "revenue" in data and "by_status" in data

    # staff cannot see reports
    _create_staff(client, token)
    staff_token = client.post(
        "/auth/login", json={"email": "staff@demo.com", "password": "secret123"}
    ).json()["access_token"]
    assert client.get("/reports", headers=_auth(staff_token)).status_code == 403


def test_clients_aggregated_with_history(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    day = date.fromordinal(date.today().toordinal() + 7).isoformat()
    slots = client.get(
        "/public/barberia-demo/availability",
        params={"service_id": svc["id"], "resource_id": res["id"], "day": day},
    ).json()["slots"]
    # slots are 15 min apart but the service is 30 min; pick non-overlapping ones
    for slot in (slots[0], slots[2]):
        client.post(
            "/public/barberia-demo/booking",
            json={"service_id": svc["id"], "resource_id": res["id"],
                  "client_name": "Repetido", "client_email": "rep@cli.com", "start_datetime": slot},
        )
    clients = client.get("/clients", headers=_auth(token)).json()
    rep = next(c for c in clients if c["email"] == "rep@cli.com")
    assert rep["total_bookings"] == 2

    history = client.get(
        "/clients/history", headers=_auth(token), params={"key": rep["key"]}
    ).json()
    assert len(history) == 2


def test_upload_payment_proof(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    booking, _ = _book_public(client, svc, res)
    code = booking["public_code"]

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    resp = client.post(
        f"/public/barberia-demo/booking/{code}/proof",
        files={"file": ("recibo.png", png, "image/png")},
    )
    assert resp.status_code == 200
    assert resp.json()["payment_proof_url"].startswith("/uploads/")

    # wrong type rejected
    bad = client.post(
        f"/public/barberia-demo/booking/{code}/proof",
        files={"file": ("x.txt", b"hello", "text/plain")},
    )
    assert bad.status_code == 415


def test_bookings_search_and_csv_export(client):
    token = _register(client)
    svc, res = _setup_business(client, token)
    _book_public(client, svc, res)  # client "Juan"

    found = client.get("/bookings", headers=_auth(token), params={"q": "jua"}).json()
    assert len(found) >= 1 and all("jua" in b["client_name"].lower() for b in found)
    assert client.get("/bookings", headers=_auth(token), params={"q": "zzz"}).json() == []

    csv = client.get("/bookings/export.csv", headers=_auth(token))
    assert csv.status_code == 200
    assert "text/csv" in csv.headers["content-type"]
    assert "Cliente" in csv.text and "Juan" in csv.text

    # staff cannot export
    _create_staff(client, token)
    staff_token = client.post(
        "/auth/login", json={"email": "staff@demo.com", "password": "secret123"}
    ).json()["access_token"]
    assert client.get("/bookings/export.csv", headers=_auth(staff_token)).status_code == 403


def test_logout_revokes_token(client):
    token = _register(client)
    assert client.get("/auth/me", headers=_auth(token)).status_code == 200
    assert client.post("/auth/logout", headers=_auth(token)).status_code == 204
    # the same access token no longer works
    assert client.get("/auth/me", headers=_auth(token)).status_code == 401


def test_email_verification_flow(client):
    from app.security import create_verify_token

    token = _register(client)
    me = client.get("/auth/me", headers=_auth(token)).json()
    assert me["email_verified"] is False

    verify_token = create_verify_token(me["id"])
    resp = client.post("/auth/verify-email", json={"token": verify_token})
    assert resp.status_code == 200
    me2 = client.get("/auth/me", headers=_auth(token)).json()
    assert me2["email_verified"] is True


def test_verify_email_bad_token(client):
    assert client.post("/auth/verify-email", json={"token": "nope"}).status_code == 400


def test_event_packages_add_to_total(client):
    token = _register(client)
    svc, res = _setup_business(client, token)  # service price 50000
    pkg = client.post(
        "/packages", headers=_auth(token), json={"name": "Payaso", "price": "150000"}
    )
    assert pkg.status_code == 201
    pid = pkg.json()["id"]

    day = date.fromordinal(date.today().toordinal() + 7).isoformat()
    slot = client.get(
        "/public/barberia-demo/availability",
        params={"service_id": svc["id"], "resource_id": res["id"], "day": day},
    ).json()["slots"][0]
    booking = client.post(
        "/public/barberia-demo/booking",
        json={"service_id": svc["id"], "resource_id": res["id"], "client_name": "Juan",
              "start_datetime": slot, "package_ids": [pid]},
    ).json()
    assert [p["id"] for p in booking["packages"]] == [pid]
    # total = service (50000) + package (150000)
    assert float(booking["total_price"]) == 200000.0


def test_event_mode_booking_without_service(client):
    resp = client.post(
        "/auth/register",
        json={"business_name": "Salón Fiesta", "slug": "salon", "name": "Owner",
              "email": "salon@x.com", "password": "secret123", "booking_mode": "events"},
    )
    token = resp.json()["access_token"]
    h = _auth(token)
    res = client.post("/resources", headers=h, json={"name": "Salón principal"}).json()
    pkg = client.post("/packages", headers=h, json={"name": "Alquiler", "price": "500000"}).json()
    for dow in range(7):
        client.post("/schedules", headers=h,
                    json={"resource_id": res["id"], "day_of_week": dow,
                          "start_time": "08:00", "end_time": "23:00"})

    day = date.fromordinal(date.today().toordinal() + 7).isoformat()
    av = client.get("/public/salon/availability", params={"resource_id": res["id"], "day": day})
    assert av.status_code == 200 and len(av.json()["slots"]) > 0
    slot = av.json()["slots"][0]

    booking = client.post(
        "/public/salon/booking",
        json={"resource_id": res["id"], "client_name": "Ana", "start_datetime": slot,
              "package_ids": [pkg["id"]]},
    )
    assert booking.status_code == 201
    data = booking.json()
    assert data["service_id"] is None
    assert float(data["total_price"]) == 500000.0


def test_login_rate_limited(client):
    _register(client)
    # exhaust the window with bad attempts, then expect 429
    statuses = set()
    for _ in range(15):
        r = client.post("/auth/login", json={"email": "owner@demo.com", "password": "wrong"})
        statuses.add(r.status_code)
    assert 429 in statuses


def test_requires_authentication(client):
    assert client.get("/services").status_code == 401


def test_slug_conflict(client):
    _register(client, slug="repetido", email="a@demo.com")
    resp = client.post(
        "/auth/register",
        json={"business_name": "Otro", "slug": "repetido", "name": "Bob",
              "email": "b@demo.com", "password": "secret123"},
    )
    assert resp.status_code == 409
