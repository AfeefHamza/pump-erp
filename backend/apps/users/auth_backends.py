# apps/users/auth_backends.py
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model

class CaseInsensitiveModelBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        
        if username is None:
            return None
            
        try:
            # Case-insensitive email lookup
            user = UserModel.objects.get(email__iexact=username)
        except UserModel.DoesNotExist:
            # Run the default password hasher once to reduce vulnerability to timing attacks
            UserModel().set_password(password)
        else:
            if user.check_password(password):
                return user
        return None
