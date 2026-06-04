"""Tests for plan limits and feature gating."""


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _register(client, slug="biz", email="owner@biz.com"):
    return client.post(
        "/auth/register",
        json={"business_name": "Mi Negocio", "slug": slug, "name": "Owner",
              "email": email, "password": "secret123"},
    ).json()["access_token"]


def test_free_plan_starts_and_reports_usage(client):
    token = _register(client)
    sub = client.get("/subscription", headers=_auth(token)).json()
    assert sub["plan"]["code"] == "free"
    assert sub["limits"]["resources"] == 1
    assert sub["usage"]["resources"] == 0


def test_free_resource_limit(client):
    token = _register(client)
    assert client.post("/resources", headers=_auth(token), json={"name": "R1"}).status_code == 201
    r2 = client.post("/resources", headers=_auth(token), json={"name": "R2"})
    assert r2.status_code == 403
    assert "límite de recursos" in r2.json()["detail"]


def test_free_service_limit(client):
    token = _register(client)
    ok = client.post("/services", headers=_auth(token),
                     json={"name": "S1", "duration_minutes": 30, "price": "0"})
    assert ok.status_code == 201
    r2 = client.post("/services", headers=_auth(token),
                     json={"name": "S2", "duration_minutes": 30, "price": "0"})
    assert r2.status_code == 403
    assert "límite de servicios" in r2.json()["detail"]


def test_free_user_limit(client):
    token = _register(client)
    # owner already counts as the single allowed user on Free
    r = client.post("/users", headers=_auth(token),
                    json={"name": "Empleado", "email": "e@biz.com", "password": "secret123", "role": "staff"})
    assert r.status_code == 403
    assert "límite de usuarios" in r.json()["detail"]


def test_upgrade_raises_limits(client):
    token = _register(client)
    client.post("/resources", headers=_auth(token), json={"name": "R1"})
    # upgrade to Pro (3 resources)
    sub = client.post("/subscription/change", headers=_auth(token),
                      json={"plan_code": "pro"}).json()
    assert sub["plan"]["code"] == "pro"
    assert sub["limits"]["resources"] == 3
    assert client.post("/resources", headers=_auth(token), json={"name": "R2"}).status_code == 201
    assert client.post("/resources", headers=_auth(token), json={"name": "R3"}).status_code == 201
    assert client.post("/resources", headers=_auth(token), json={"name": "R4"}).status_code == 403


def test_reports_gated_by_feature(client):
    token = _register(client)
    # Free has no advanced_reports
    assert client.get("/reports", headers=_auth(token)).status_code == 403
    # Business includes it
    client.post("/subscription/change", headers=_auth(token), json={"plan_code": "business"})
    assert client.get("/reports", headers=_auth(token)).status_code == 200


def test_plans_listing(client):
    token = _register(client)
    plans = client.get("/plans", headers=_auth(token)).json()
    codes = [p["code"] for p in plans]
    assert codes == ["free", "pro", "business", "enterprise"]
    biz = next(p for p in plans if p["code"] == "business")
    assert any(f["code"] == "whatsapp_reminders" for f in biz["features"])
