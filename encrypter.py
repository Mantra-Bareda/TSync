import random

def encrypt(string_from_user):
    sep1 = ['#','$','&'] ## for strings
    sep2 = ['@','!','*'] ## for special
    sep3 = ['a','g','d'] ## for digits
    sep4 = ['E']
    extra = ['b', 'c', 'f', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']
    l="""#!@$%^&*().,></'="\?+_-"""

    ## shift for str = 40
    ## shift for digits = 20 
    ## shift for l = 10 (33 , 95):(min,max)
    # for extra that this sep4 + as it is

    text = string_from_user
    encrypt_text = ""

    for i in text:
        f=True
        x,zn,yn = random.randint(2,5),random.randint(1,3) , random.randint(1,3)
        z = "".join([random.choice(extra) for j in range(zn) ])
        y = "".join([random.choice(extra) for j in range(yn) ])
        x1= str(x)
        if i.isdigit():
            s1,s2=random.choice(sep2) , random.choice(sep2)
            o = (ord(str(i))-20)
            o2 = [j for j in str(o+x)]
        elif i.isalpha():
            s1,s2=random.choice(sep1) , random.choice(sep1)
            o = (ord(str(i))-40)
            o2 = [j for j in str(o+x)]
        elif i in l:
            s1,s2=random.choice(sep3) , random.choice(sep3)
            o = (ord(str(i))-10)
            o2 = [j for j in str(o+x)]
        else:
            z2,y2 = "".join([random.choice(extra) for i in range(3)]),"".join([random.choice(extra) for i in range(3)])
            s1,s2=sep4[0],sep4[0]
            f= False
            en = s1+z2+i+y2+s2
        
        if f:
            en = s1+o2[0]+z+x1+y+o2[1]+s2

        encrypt_text +=en

    return encrypt_text

def decrypt(en):
    en1 = en
    seps = ['#','$','&','@','!','*','a','g','d','E']
    w = []  
    c = 0
    for i in range(len(en)):
        if en[i] in seps:
            c+=1
    c= int(c/2)
    en = en[1:]
    for i in range(c):
        for j in range(len(en)):
            if en[j] in seps:
                w.append(en[:j])
                en = en[j+2:]
                break
    sep1 = ['#','$','&'] ## for strings
    sep2 = ['@','!','*'] ## for int
    sep3 = ['a','g','d'] ## for sp
    sep4 = ['E',] ## for extras
    extra = ['b', 'c', 'f', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']
    l="""#!@$%^&*().,></'"=?+_\-"""
    s_w = []
    for i in range(len(w)):
        s = en1[0]
        en1 = en1[len(w[i])+2:]
        if s in sep1:
            s_w.append('s')
        elif s in sep2:
            s_w.append('d')
        elif s in sep3:
            s_w.append('sp')
        else:
            s_w.append('e')

    w_final = []

    for i in range(len(w)):
        d,ex= [] , None
        for j in w[i]:
            if s_w[i] == 'e':
                if j not in extra:
                    ex = j
            if j.isdigit():
                d.append(j)
            else:
                pass
        d = [int(i) for i in d]
        if len(d) != 0:
            w_final.append([(d[0]*10)+d[2] , d[1]])
        else:
            w_final.append(ex)

    text =""
    for i in range(len(w_final)):
        if str(type(w_final[i])) == "<class 'list'>": 
           asc_wo_s = w_final[i][0]-w_final[i][1]
           if s_w[i] == 's':
                shift = 40
           if s_w[i] == 'd':
                shift = 20
           if s_w[i] == 'sp':
                shift = 10
           asc = asc_wo_s+shift

           text+=chr(asc)
        else:
           text+=str(w_final[i])
    return text
