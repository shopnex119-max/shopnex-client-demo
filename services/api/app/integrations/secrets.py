import keyring
from keyring.errors import KeyringError

_SERVICE = "shopnex-zatca"


class SecretStoreUnavailable(RuntimeError):
    """Raised when the operating-system credential vault cannot be used."""


def _ensure_secure_backend() -> None:
    backend = keyring.get_keyring()
    priority = getattr(backend, "priority", 0)
    if priority <= 0:
        raise SecretStoreUnavailable("No secure operating-system credential store is available")


def store_credential(company_id: str, environment: str, value: str) -> None:
    _ensure_secure_backend()
    try:
        keyring.set_password(_SERVICE, f"{company_id}:{environment}:api-credential", value)
    except KeyringError as exc:
        raise SecretStoreUnavailable("Could not save the credential to the operating-system vault") from exc


def credential_exists(company_id: str, environment: str) -> bool:
    try:
        _ensure_secure_backend()
        return keyring.get_password(_SERVICE, f"{company_id}:{environment}:api-credential") is not None
    except (KeyringError, SecretStoreUnavailable):
        return False


def get_credential(company_id: str, environment: str) -> str | None:
    _ensure_secure_backend()
    try:
        return keyring.get_password(_SERVICE, f"{company_id}:{environment}:api-credential")
    except KeyringError as exc:
        raise SecretStoreUnavailable("Could not read the operating-system vault") from exc
