# Changelog

## [1.1.0](https://github.com/davidsneighbour/posthaste/compare/v1.0.0...v1.1.0) (2026-08-15)

### Feat

* **posthaste-unsplash:** register Unsplash skill ([8926fee](https://github.com/davidsneighbour/posthaste/commit/8926fee41ac5159c36c7f085a8f9000b5904303a)), closes [#17](https://github.com/davidsneighbour/posthaste/issues/17)

### Docs

* **fix:** readme markup fixes ([25c2043](https://github.com/davidsneighbour/posthaste/commit/25c2043b2b5614361037360b7e12c35d9091e236))
* **fix:** update README.md ([c060bf3](https://github.com/davidsneighbour/posthaste/commit/c060bf34b7b9d049a1f449f627a983fcc89b9276))

### Build

* **vscode:** update workspace configuration ([de620f2](https://github.com/davidsneighbour/posthaste/commit/de620f27b9ea78c02ec74c44fa9133fca080c5f4))

### Chore

* add claude plugin marketplace ([11a4228](https://github.com/davidsneighbour/posthaste/commit/11a42287319321cc21e18ab90ecd17d385196c73)), closes [#16](https://github.com/davidsneighbour/posthaste/issues/16)
* validate skill manifest metadata ([955d5d6](https://github.com/davidsneighbour/posthaste/commit/955d5d6766d07116a95905573de6b7cd5a9616f0)), closes [#15](https://github.com/davidsneighbour/posthaste/issues/15)

## 1.0.0 (2026-08-09)

### Feat

* **posthaste-config:** add layered TOML configuration skill ([e6f83f4](https://github.com/davidsneighbour/posthaste/commit/e6f83f44df3de4bb69835ce0b800b87298c21ff8)), closes [#4](https://github.com/davidsneighbour/posthaste/issues/4)
* **posthaste-config:** apply TOML runtime configuration ([b5a6d9c](https://github.com/davidsneighbour/posthaste/commit/b5a6d9c9a4cc718ae7f406ced1c6c6f3deddd21e)), closes [#5](https://github.com/davidsneighbour/posthaste/issues/5)
* **posthaste:** package installable skillset ([6391516](https://github.com/davidsneighbour/posthaste/commit/6391516c87e5c5ef7f8d5f100745000df74f753f)), closes [#3](https://github.com/davidsneighbour/posthaste/issues/3)

### Refactor

* **posthaste-voice:** generalise author wording ([67c175d](https://github.com/davidsneighbour/posthaste/commit/67c175d54167fc64707019babc300e0182d4db17)), closes [#8](https://github.com/davidsneighbour/posthaste/issues/8)

### Docs

* clarify skill installation and config precedence ([403e0b0](https://github.com/davidsneighbour/posthaste/commit/403e0b0c5dc0a107a474e8664544ea43b0b639cd)), closes [#13](https://github.com/davidsneighbour/posthaste/issues/13)
* document agent workflow rules ([2f7057d](https://github.com/davidsneighbour/posthaste/commit/2f7057d78ddbf8937dc14b5d7881d073212a4a4b)), closes [#1](https://github.com/davidsneighbour/posthaste/issues/1)
* document Posthaste TOML configuration ([279301c](https://github.com/davidsneighbour/posthaste/commit/279301c6af3c5ad79defed086f79d95b61c34180)), references [#4](https://github.com/davidsneighbour/posthaste/issues/4)
* document supported network setup ([d8b209a](https://github.com/davidsneighbour/posthaste/commit/d8b209a02cbde5a5abd26f3a5988dd4224b7bfad)), closes [#12](https://github.com/davidsneighbour/posthaste/issues/12)
* orient config diagram vertically ([33f7914](https://github.com/davidsneighbour/posthaste/commit/33f79149ca84f2db1e809fe45400ecbdd9a2cd8a)), closes [#14](https://github.com/davidsneighbour/posthaste/issues/14)
* **posthaste-voice:** advertise skill in maps ([fd23942](https://github.com/davidsneighbour/posthaste/commit/fd23942be63f30ee6c631d477e1134ae102e4fda)), closes [#11](https://github.com/davidsneighbour/posthaste/issues/11)
* **posthaste-voice:** align voice instructions ([99052ae](https://github.com/davidsneighbour/posthaste/commit/99052aec68b70df2cfdee03bfe4bda01d8a9df82)), closes [#10](https://github.com/davidsneighbour/posthaste/issues/10)
* **posthaste:** resolve config before workflows ([3a104b5](https://github.com/davidsneighbour/posthaste/commit/3a104b52826b4cd86eeac9db67f4b7884a9907fe)), references [#4](https://github.com/davidsneighbour/posthaste/issues/4)
* **posthaste:** route configuration requests ([40403d0](https://github.com/davidsneighbour/posthaste/commit/40403d0afd987103262fab692d9cc30adbf73fdb)), references [#4](https://github.com/davidsneighbour/posthaste/issues/4)
* require linked repository references ([720176d](https://github.com/davidsneighbour/posthaste/commit/720176d6b87ac6f090dcebf49fc4b9833adfaba7)), closes [#7](https://github.com/davidsneighbour/posthaste/issues/7)
* use Posthaste! skill-set name ([b18647e](https://github.com/davidsneighbour/posthaste/commit/b18647e3bd461f2b076f43f9ad34a4f31171e8ea)), closes [#6](https://github.com/davidsneighbour/posthaste/issues/6)

### Chore

* initial commit, reposetup ([eb5a31d](https://github.com/davidsneighbour/posthaste/commit/eb5a31defea5b405b5d225c3372be1767cd0d812))
* onboard cspell spelling checks ([9b04684](https://github.com/davidsneighbour/posthaste/commit/9b0468455455e27674d141a6621422a61f83a397)), closes [#9](https://github.com/davidsneighbour/posthaste/issues/9)
* onboard shared DNBHQ configs ([854f4c4](https://github.com/davidsneighbour/posthaste/commit/854f4c4f7ee23cdd8eaee4fa01d8007b96868098)), closes [#2](https://github.com/davidsneighbour/posthaste/issues/2)
