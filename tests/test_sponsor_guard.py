import pytest
import json
import re
from contextlib import contextmanager
from datetime import datetime, timezone

@contextmanager
def capture_transfers(direct_vm):
    captured = []
    def gl_call_hook(vm, request):
        captured.append(request)
        return {"ok": None}

    old_hook = getattr(direct_vm, '_gl_call_hook', None)
    direct_vm._gl_call_hook = gl_call_hook
    try:
        yield captured
    finally:
        direct_vm._gl_call_hook = old_hook

def assert_transfers_count(captured, count):
    assert len(captured) == count, f"Expected exactly {count} transfer(s), got {len(captured)}"

def assert_transfer(captured, idx, recipient, value):
    from genlayer.py.types import Address
    req = captured[idx]
    assert 'EthSend' in req, f"Expected EthSend message, got {req}"
    eth_send = req['EthSend']

    expected_recipient = recipient if isinstance(recipient, Address) else Address(recipient)
    actual_recipient = eth_send['address']
    if not isinstance(actual_recipient, Address):
        actual_recipient = Address(actual_recipient)

    assert actual_recipient == expected_recipient, f"Expected recipient {expected_recipient}, got {actual_recipient}"
    assert eth_send['value'] == value, f"Expected value {value}, got {eth_send['value']}"
    assert eth_send['calldata'] == b'', f"Expected empty calldata, got {eth_send['calldata']}"

def mock_content_web(direct_vm, url, body="Compliant content containing #ad", status=200):
    escaped_url = re.escape(url)
    direct_vm.mock_web(escaped_url, {"status": status, "body": body})

def mock_llm_verdict(direct_vm, verdict="COMPLIANT", disclosure_present=True, policy_findings=None, reason="Compliant content", recommended_action="RELEASE"):
    if policy_findings is None:
        policy_findings = []
    llm_output = {
        "verdict": verdict,
        "disclosure_present": disclosure_present,
        "policy_findings": policy_findings,
        "reason": reason,
        "recommended_action": recommended_action
    }
    direct_vm.mock_llm(r".*", json.dumps(llm_output))

def test_create_campaign_valid(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    policy = "Content must include #ad disclosure."
    future_deadline = 9999999999
    recheck_interval = 3600

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        camp_id = contract.create_campaign(direct_bob, policy, future_deadline, recheck_interval)

    assert camp_id == 1
    assert contract.get_campaign_count() == 1

    camp_json = json.loads(contract.get_campaign(1))
    assert camp_json["campaign_id"] == 1
    assert camp_json["sponsor"].lower() == f"0x{direct_alice.hex()}".lower()
    assert camp_json["creator"].lower() == f"0x{direct_bob.hex()}".lower()
    assert camp_json["budget"] == "1000"
    assert camp_json["deadline"] == future_deadline
    assert camp_json["recheck_interval"] == recheck_interval
    assert camp_json["status"] == "OPEN"
    assert camp_json["policy"] == policy

def test_create_campaign_invalid(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")
    policy = "Rule"
    future_deadline = 9999999999

    # 1. Budget must be positive
    with direct_vm.expect_revert("Budget must be positive"):
        with direct_vm.prank(direct_alice):
            direct_vm.value = 0
            contract.create_campaign(direct_bob, policy, future_deadline, 3600)

    # 2. Sponsor cannot be creator
    with direct_vm.expect_revert("Sponsor cannot be the creator"):
        with direct_vm.prank(direct_alice):
            direct_vm.value = 1000
            contract.create_campaign(direct_alice, policy, future_deadline, 3600)

    # 3. Deadline in past
    with direct_vm.expect_revert("Deadline must be in the future"):
        with direct_vm.prank(direct_alice):
            direct_vm.value = 1000
            contract.create_campaign(direct_bob, policy, 1000000000, 3600)

def test_cancel_campaign(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)

    # Non-sponsor cannot cancel
    with direct_vm.expect_revert("Only the sponsor can cancel"):
        with direct_vm.prank(direct_bob):
            contract.cancel_campaign(1)

    # Cancel & refund
    with direct_vm.prank(direct_alice):
        with capture_transfers(direct_vm) as transfers:
            contract.cancel_campaign(1)

    assert_transfers_count(transfers, 1)
    assert_transfer(transfers, 0, direct_alice, 1000)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "CANCELED"

    # Cannot accept canceled campaign
    with direct_vm.expect_revert("accepted while OPEN"):
        with direct_vm.prank(direct_bob):
            direct_vm.value = 200
            contract.accept_campaign(1)

def test_accept_campaign_bond_requirements(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)

    # Wrong sender cannot accept
    with direct_vm.expect_revert("Only the designated creator can accept"):
        with direct_vm.prank(direct_alice):
            direct_vm.value = 200
            contract.accept_campaign(1)

    # Wrong bond amount (needs exactly 20%)
    with direct_vm.expect_revert("bond must be exactly 20%"):
        with direct_vm.prank(direct_bob):
            direct_vm.value = 199
            contract.accept_campaign(1)

    # Accept campaign successfully
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "ACCEPTED"
    assert camp["bond"] == "200"

def test_submit_content_authorization(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)

    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)

    # Non-creator cannot submit content
    with direct_vm.expect_revert("Only the creator can submit content"):
        with direct_vm.prank(direct_alice):
            contract.submit_content(1, "https://post.url/1")

    # Submit successfully
    with direct_vm.prank(direct_bob):
        contract.submit_content(1, "https://post.url/1")

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "SUBMITTED"
    assert camp["content_url"] == "https://post.url/1"

def test_baseline_evaluation_compliant_release(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    # Setup campaign
    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    # Setup web fetch and LLM verdict mocks
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "This is compliant content.")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")

    # Evaluate baseline
    with capture_transfers(direct_vm) as transfers:
        contract.evaluate_baseline(1)

    # Compliant baseline releases Tranche 1 (1/3 of budget = 333)
    assert_transfers_count(transfers, 1)
    assert_transfer(transfers, 0, direct_bob, 333)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "ACTIVE"
    assert camp["tranches_released"] == 1
    assert camp["checks_run"] == 1

    # Audit trail verification
    check = json.loads(contract.get_check(1, 1))
    assert check["verdict"] == "COMPLIANT"
    assert check["recommended_action"] == "RELEASE"

def test_baseline_evaluation_warning_holds_payment(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "This content misses required ad disclosure.")
    mock_llm_verdict(direct_vm, verdict="WARNING", disclosure_present=False, policy_findings=["Missing disclosure"], recommended_action="HOLD")

    # Evaluate baseline
    with capture_transfers(direct_vm) as transfers:
        contract.evaluate_baseline(1)

    # Warning holds payment; no transfers are emitted
    assert_transfers_count(transfers, 0)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "WARNING"
    assert camp["tranches_released"] == 0
    assert camp["checks_run"] == 1
    assert camp["warning_held"] is True

def test_remediation_followed_by_compliant_recheck(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    # Baseline warning
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Non-compliant")
    mock_llm_verdict(direct_vm, verdict="WARNING", recommended_action="HOLD")
    contract.evaluate_baseline(1)

    # Premature check fails
    with direct_vm.expect_revert("Recheck is premature"):
        contract.request_recheck(1)

    # Warp time by 1 hour (3600 seconds)
    direct_vm.warp("2026-07-18T11:00:00Z")

    # Remediation check is compliant
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant content #ad")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")

    with capture_transfers(direct_vm) as transfers:
        contract.request_recheck(1)

    # Resolves held warning and releases Tranche 1 (333)
    assert_transfers_count(transfers, 1)
    assert_transfer(transfers, 0, direct_bob, 333)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "ACTIVE"
    assert camp["tranches_released"] == 1
    assert camp["checks_run"] == 2
    assert camp["warning_held"] is False

def test_major_violation_50_slash(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    # Baseline compliant
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")
    contract.evaluate_baseline(1)

    # Warp past interval
    direct_vm.warp("2026-07-18T11:00:00Z")

    # Recheck major violation
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Competitor product endorsement")
    mock_llm_verdict(direct_vm, verdict="MAJOR_VIOLATION", recommended_action="TERMINATE")

    with capture_transfers(direct_vm) as transfers:
        contract.request_recheck(1)

    # Major violation terminates vesting and slashes 50% bond:
    # Sponsor gets: remaining budget (1000 - 333 = 667) + slashed bond (200 * 50% = 100) = 767 total
    # Creator gets: remaining bond (100)
    assert_transfers_count(transfers, 3)
    # Payout 1: Refund remaining budget (667) to sponsor
    assert_transfer(transfers, 0, direct_alice, 667)
    # Payout 2: Transfer slashed bond (100) to sponsor
    assert_transfer(transfers, 1, direct_alice, 100)
    # Payout 3: Return remaining bond (100) to creator
    assert_transfer(transfers, 2, direct_bob, 100)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "TERMINATED"

def test_removed_content_100_slash(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    # Baseline compliant
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")
    contract.evaluate_baseline(1)

    # Warp
    direct_vm.warp("2026-07-18T11:00:00Z")

    # Simulated content removal (e.g. HTTP 404 page)
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Not Found", status=404)

    with capture_transfers(direct_vm) as transfers:
        contract.request_recheck(1)

    # Removed content terminates vesting and slashes 100% bond:
    # Sponsor gets: remaining budget (667) + entire bond (200) = 867
    assert_transfers_count(transfers, 2)
    assert_transfer(transfers, 0, direct_alice, 667)
    assert_transfer(transfers, 1, direct_alice, 200)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "TERMINATED"

def test_final_recheck_remainder_handling(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    # Check 1 (Baseline Compliant): Tranche 1 release (1000 // 3 = 333)
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")
    contract.evaluate_baseline(1)

    # Check 2 (Recheck Compliant): Tranche 2 release (1000 // 3 = 333)
    direct_vm.warp("2026-07-18T11:00:00Z")
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")
    with capture_transfers(direct_vm) as transfers_check_2:
        contract.request_recheck(1)
    assert_transfers_count(transfers_check_2, 1)
    assert_transfer(transfers_check_2, 0, direct_bob, 333)

    # Check 3 (Recheck Compliant): Tranche 3 release (budget remainder: 1000 - 333 - 333 = 334) + bond release (200)
    direct_vm.warp("2026-07-18T12:00:00Z")
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")
    with capture_transfers(direct_vm) as transfers_check_3:
        contract.request_recheck(1)

    assert_transfers_count(transfers_check_3, 2)
    # Tranche 3 gets the remainder: 334
    assert_transfer(transfers_check_3, 0, direct_bob, 334)
    # Creator bond released in full
    assert_transfer(transfers_check_3, 1, direct_bob, 200)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "COMPLETED"

def test_malformed_llm_output_recovery(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant")

    # Mocks a completely malformed json missing required keys (policy_findings)
    bad_output = {
        "verdict": "COMPLIANT",
        "disclosure_present": True
    }
    direct_vm.mock_llm(r".*", json.dumps(bad_output))

    # Attempting evaluate should revert and restore campaign status to SUBMITTED
    with pytest.raises(Exception):
        contract.evaluate_baseline(1)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "SUBMITTED"

def test_semantic_consensus_agree_and_disagree(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 9999999999, 3600)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant content")

    # 1. Leader gets COMPLIANT / RELEASE (Reason A)
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", reason="Reason A", recommended_action="RELEASE")
    contract.evaluate_baseline(1)

    # 2. Validator gets COMPLIANT / RELEASE but with different reason (Reason B) -> Should AGREE
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant content")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", reason="Reason B", recommended_action="RELEASE")
    assert direct_vm.run_validator() is True

    # 3. Validator gets WARNING / HOLD -> Should DISAGREE
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant content")
    mock_llm_verdict(direct_vm, verdict="WARNING", reason="Reason B", recommended_action="HOLD")
    assert direct_vm.run_validator() is False

def test_settle_expired_campaign_active(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    # Create campaign (budget = 1000, deadline = 1784378800)
    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 1784378800, 3600)

    # Accept campaign (bond = 200)
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)

    # Submit content
    with direct_vm.prank(direct_bob):
        contract.submit_content(1, "https://post.url/1")

    # Baseline evaluation: compliant (releases tranche 1 = 333)
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Compliant content")
    mock_llm_verdict(direct_vm, verdict="COMPLIANT", recommended_action="RELEASE")
    contract.evaluate_baseline(1)

    # Warp before deadline -> settle_expired_campaign should revert
    direct_vm.warp("2026-07-18T11:00:00Z") # 1784372400 < 1784378800
    with direct_vm.expect_revert("Deadline has not been reached yet"):
        contract.settle_expired_campaign(1)

    # Warp past deadline
    direct_vm.warp("2026-07-18T13:00:00Z") # 1784379600 > 1784378800

    # Recheck after deadline should revert
    with direct_vm.expect_revert("Campaign deadline has passed"):
        contract.request_recheck(1)

    # Settle campaign:
    # Tranche 1 was released (333). Unpaid budget is 667. Bond is 200.
    # Sponsor should get remaining budget refund: 667
    # Creator should get safety bond returned: 200
    with capture_transfers(direct_vm) as transfers:
        contract.settle_expired_campaign(1)

    assert_transfers_count(transfers, 2)
    assert_transfer(transfers, 0, direct_alice, 667)
    assert_transfer(transfers, 1, direct_bob, 200)

    # Campaign status becomes COMPLETED
    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "COMPLETED"

    # Second settlement attempt should revert
    with direct_vm.expect_revert("Campaign is not in a settleable state"):
        contract.settle_expired_campaign(1)

def test_settle_expired_campaign_warning_held(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 1784378800, 3600)

    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)
        contract.submit_content(1, "https://post.url/1")

    # Baseline warning holds payment (released_tranches = 0)
    direct_vm.clear_mocks()
    mock_content_web(direct_vm, "https://post.url/1", "Violating content")
    mock_llm_verdict(direct_vm, verdict="WARNING", recommended_action="HOLD")
    contract.evaluate_baseline(1)

    # Warp past deadline without remediation
    direct_vm.warp("2026-07-18T13:00:00Z") # 1784379600 > 1784378800

    # Settle campaign:
    # 0 tranches released. Unpaid budget is 1000. Bond is 200.
    # Sponsor should get remaining budget refund: 1000
    # Creator should get safety bond returned: 200
    with capture_transfers(direct_vm) as transfers:
        contract.settle_expired_campaign(1)

    assert_transfers_count(transfers, 2)
    assert_transfer(transfers, 0, direct_alice, 1000)
    assert_transfer(transfers, 1, direct_bob, 200)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "COMPLETED"

def test_settle_expired_open_campaign(direct_deploy, direct_vm, direct_alice, direct_bob):
    # Tests that an OPEN campaign (no creator acceptance, no bond) can be settled permissionlessly after expiration.
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 1784378800, 3600)

    # Warp past deadline
    direct_vm.warp("2026-07-18T13:00:00Z")

    # Charlie (third-party) calls settle_expired_campaign
    charlie = b'\x33' * 20
    with direct_vm.prank(charlie):
        with capture_transfers(direct_vm) as transfers:
            contract.settle_expired_campaign(1)

    # Charlie is third-party, settlement succeeds, refunds budget to sponsor, 0 bond to creator
    assert_transfers_count(transfers, 1)
    assert_transfer(transfers, 0, direct_alice, 1000)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "COMPLETED"

def test_creator_accept_and_submit_after_deadline(direct_deploy, direct_vm, direct_alice, direct_bob):
    # Tests that creator cannot accept or submit content after the deadline.
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 1784378800, 3600)

    # Warp past deadline
    direct_vm.warp("2026-07-18T13:00:00Z")

    # Creator tries to accept after deadline -> should revert
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        with direct_vm.expect_revert("Campaign deadline has expired"):
            contract.accept_campaign(1)

    # Warp back before deadline to accept
    direct_vm.warp("2026-07-18T11:00:00Z")
    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)

    # Warp past deadline again
    direct_vm.warp("2026-07-18T13:00:00Z")

    # Creator tries to submit content after deadline -> should revert
    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Campaign deadline has expired"):
            contract.submit_content(1, "https://post.url/1")

def test_settle_expired_accepted_campaign(direct_deploy, direct_vm, direct_alice, direct_bob):
    # Tests that an ACCEPTED campaign (creator accepted but no content submitted) settled after deadline refunds sponsor budget and creator bond.
    direct_vm.warp("2026-07-18T10:00:00Z")
    contract = direct_deploy("contracts/sponsor_guard.py")

    with direct_vm.prank(direct_alice):
        direct_vm.value = 1000
        contract.create_campaign(direct_bob, "Policy", 1784378800, 3600)

    with direct_vm.prank(direct_bob):
        direct_vm.value = 200
        contract.accept_campaign(1)

    # Warp past deadline
    direct_vm.warp("2026-07-18T13:00:00Z")

    # Third party calls settle
    charlie = b'\x33' * 20
    with direct_vm.prank(charlie):
        with capture_transfers(direct_vm) as transfers:
            contract.settle_expired_campaign(1)

    # Budget (1000) returned to sponsor (alice), bond (200) returned to creator (bob)
    assert_transfers_count(transfers, 2)
    assert_transfer(transfers, 0, direct_alice, 1000)
    assert_transfer(transfers, 1, direct_bob, 200)

    camp = json.loads(contract.get_campaign(1))
    assert camp["status"] == "COMPLETED"
