import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as Papa from 'papaparse';

@Injectable()
export class WeatherService {    

    private openWeatherApiKey: string;
    private tomorrowApiKey: string;
    private accuWeatherApiKey: string;

    constructor(private configService: ConfigService) {
        this.openWeatherApiKey = this.configService.get<string>('OPENWEATHER_API_KEY', '');
        this.tomorrowApiKey = this.configService.get<string>('TOMORROW_API_KEY', '');
        this.accuWeatherApiKey = this.configService.get<string>('ACCUWEATHER_API_KEY', '');
    }

    async getOpenWeather(lat: string, lon: string) {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.openWeatherApiKey}&units=mitric`;
            const response = await axios.get(url);
            return response.data;
        } catch (error) {
            throw new HttpException('Failed to fetch OpenWeathrer data', HttpStatus.BAD_GATEWAY);
        }
    }

    async getTomorrowWeather(lat: string, lon: string) {
        try {
            const url = `https://api.tomorrow.io/v4/timelines?location=${lat},${lon}&fields=temperature&units=metric&apikey=${this.tomorrowApiKey}`;
            const response = await axios.get(url);
            return response.data;
        } catch (error) {
            throw new HttpException('Failed to fetch Tomorrow.io data', HttpStatus.BAD_GATEWAY);
        }
    }

    async getAccuWeather(lat: string, lon: string) {
        try {
            // 1. Cari Location Key
            const locationUrl = `http://dataservice.accuweather.com/locations/v1/cities/geoposition/search?apikey=${this.accuWeatherApiKey}&q=${lat},${lon}`;
            const locationResponse = await axios.get(locationUrl);
            const locationKey = locationResponse.data.Key;

            // 2. Ambil current conditions
            const weatherUrl = `http://dataservice.accuweather.com/currentconditions/v1/${locationKey}?apikey=${this.accuWeatherApiKey}&details=true`;
            const weatherResponse = await axios.get(weatherUrl);
            return weatherResponse.data;
        } catch (error) {
            throw new HttpException('Failed to fetch AccuWeather data', HttpStatus.BAD_GATEWAY);
        }
    }

    private async getBMKGAdm4Code(lat: string, lon: string): Promise<string> {
        try {
            // 1. Reverse geocoding Nominatim
            const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`;
            const geoRes = await axios.get(geoUrl, {
                headers: { 'User-Agent': 'NestJS-WeatherService' }
            });

            const addr = geoRes.data.address;

            // Ambil sesuai prioritas mapping Indonesia
            const prov = addr.state?.toUpperCase();
            const kab = addr.city?.toUpperCase() || addr.county?.toUpperCase();
            const kec = addr.suburb?.toUpperCase() || addr.city_district?.toUpperCase();
            const kel = addr.village?.toUpperCase() || addr.neighbourhood?.toUpperCase();

            console.log(`Provinsi: ${prov}`);
            console.log(`Kab/Kota: ${kab}`);
            console.log(`Kecamatan: ${kec}`);
            console.log(`Kelurahan: ${kel}`);

            // 2. Ambil CSV Permendagri
            const csvUrl = 'https://raw.githubusercontent.com/kodewilayah/permendagri-72-2019/main/dist/base.csv';
            const csvRes = await axios.get(csvUrl);
            const parsed = Papa.parse(csvRes.data, { header: false });
            const rows: { kode: string; nama: string }[] = parsed.data.map((r: any) => ({
                kode: r[0],
                nama: (r[1] || '').toUpperCase()
            }));

            // === STRATEGI 1: Langsung cari kelurahan ===
            let kelRow = rows.find(r => r.nama === kel);
            if (kelRow) {
                console.log('Match langsung kelurahan.');
                return kelRow.kode;
            }

            // === STRATEGI 2: Fallback bertingkat ===
            console.log('Kelurahan tidak ditemukan, mencoba pencarian bertingkat...');

            // Cari provinsi
            const provRow = rows.find(r => r.nama === prov && r.kode.endsWith('000000'));
            if (!provRow) throw new Error('Provinsi tidak ditemukan');

            // Cari kab/kota di bawah provinsi
            const kabRow = rows.find(r =>
                r.nama === kab &&
                r.kode.startsWith(provRow.kode.slice(0, 2)) &&
                r.kode.endsWith('0000') &&
                !r.kode.endsWith('000000')
            );
            if (!kabRow) throw new Error('Kab/Kota tidak ditemukan');

            // Cari kecamatan di bawah kab/kota
            const kecRow = rows.find(r =>
                r.nama === kec &&
                r.kode.startsWith(kabRow.kode.slice(0, 4)) &&
                r.kode.endsWith('00') &&
                !r.kode.endsWith('0000')
            );
            if (!kecRow) throw new Error('Kecamatan tidak ditemukan');

            // Cari kelurahan di bawah kecamatan
            kelRow = rows.find(r =>
                r.nama === kel &&
                r.kode.startsWith(kecRow.kode.slice(0, 6)) &&
                !r.kode.endsWith('00')
            );
            if (!kelRow) throw new Error('Kelurahan tidak ditemukan di fallback');

            return kelRow.kode;

        } catch (err) {
            console.error(err);
            throw new HttpException('Failed to convert lat/lon to ADM4 Kemendagri', HttpStatus.BAD_GATEWAY);
        }
    }




    async getBMKGWeather(lat: string, lon: string) {
        try {
            console.log('test');
            const adm4 = await this.getBMKGAdm4Code(lat, lon);
            console.log(`ADM4 Code: ${adm4}`);
            const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`;
            const response = await axios.get(url);
            return response.data;
        } catch {
            throw new HttpException('Failed to fetch BMKG weather data', HttpStatus.BAD_GATEWAY);
        }
    }

    async getAllWeather(lat: string, lon: string) {
        const [openWeather, tomorrowWeather, accuWeather, bmkgWeather] = await Promise.all([
            this.getOpenWeather(lat, lon),
            this.getTomorrowWeather(lat, lon),
            this.getAccuWeather(lat, lon),
            this.getBMKGWeather(lat, lon),
        ]);
        return { openWeather, tomorrowWeather, accuWeather, bmkgWeather };
    }
}
