import hashlib
import sys
import json
from zokrates_pycrypto.eddsa import PrivateKey, PublicKey
from zokrates_pycrypto.field import FQ
from zokrates_pycrypto.utils import write_signature_for_zokrates_cli, write_signature_to_json

if __name__ == "__main__":
    if len(sys.argv) > 1:
        raw_msg = sys.argv[1]
        msg = bytes.fromhex(raw_msg)

        key = FQ(1997011358982923168928344992199991480689546837621580239342656433234255379025)
        sk = PrivateKey(key)
        sig = sk.sign(msg)

        pk = PublicKey.from_private(sk)
        is_verified = pk.verify(sig, msg)

        data = write_signature_to_json(pk, sig, msg)
        
        print(data)
            
    else:
    	print("provide msg to sign")
