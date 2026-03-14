import hashlib
import sys
import json
from zokrates_pycrypto.eddsa import PrivateKey, PublicKey
from zokrates_pycrypto.field import FQ
from zokrates_pycrypto.utils import write_signature_for_zokrates_cli

if __name__ == "__main__":
    if len(sys.argv) > 1:
        #raw_msg = "This is my secret message"
        raw_msg = sys.argv[1]
        print(raw_msg)
        msg = hashlib.sha512(raw_msg.encode("utf-8")).digest()

        # sk = PrivateKey.from_rand()
        # Seeded for debug purpose
        key = FQ(1997011358982923168928344992199991480689546837621580239342656433234255379025)
        sk = PrivateKey(key)
        sig = sk.sign(msg)

        pk = PublicKey.from_private(sk)
        is_verified = pk.verify(sig, msg)
        print(is_verified)

        path = 'eddsa_verification_zokrates_cli_inputs.txt'
        write_signature_for_zokrates_cli(pk, sig, msg, path)
        
        data = {}
#R: 12930132209125725475307835897432826355060575997524359175811717200883642779493 13003612171402589622243689628541967766551218962676508143164071541127580057248
#S: 769980270789486858161534771146695885786670229061228100603152478173334688948 
#A: 14897476871502190904409029696666322856887678969656209656241038339251270171395 16668832459046858928951622951481252834155254151733002984053501254009901876174
#M0: 1794508330 3432389520 543886221 2282397418 4087915194 690503534 3574117509 1700359873
#M1: 2207043222 3276489246 851024517 1381359885 36207326 1538075940 1293787340 2634712990
        with open("eddsa_verification_zokrates_cli_inputs.txt") as f:
            content = f.read()
            i = content.split()
            
            data = {}
            data["R"] = [i[0], i[1]]
            data["S"] = i[2]
            data["A"] = [i[3], i[4]]
            data["M0"] = [i[5], i[6], i[7], i[8], i[9], i[10], i[11], i[12]]
            data["M1"] = [i[13], i[14], i[15], i[16], i[17], i[18], i[19], i[20]]
            
            json_data = json.dumps(data)
        with open("inputs.json", "w") as j:
            j.write(json_data)
            
    else:
    	print("provide msg to sign")
